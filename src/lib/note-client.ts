import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ParsedContent, Config } from '../types/index.js';
import chalk from 'chalk';

export class NoteClient {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private config: Config;

  constructor(config?: Partial<Config>) {
    this.config = {
      storageStatePath: join(homedir(), '.note-md-adapter', 'auth.json'),
      headless: false,
      ...config
    };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    // Check if storage state exists
    if (existsSync(this.config.storageStatePath)) {
      console.log(chalk.blue('Using saved authentication...'));
      this.context = await this.browser.newContext({
        storageState: this.config.storageStatePath,
      });
    } else {
      console.log(chalk.yellow('No saved authentication found. Please log in manually.'));
      this.context = await this.browser.newContext();
    }

    this.page = await this.context.newPage();
  }

  async login(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.goto('https://note.com/login');
    
    // Check if already logged in by looking for user menu or dashboard elements
    try {
      await this.page.waitForSelector('.o-navbar__avatar, .user-menu, [href*="/dashboard"]', { timeout: 3000 });
      console.log(chalk.green('Already logged in!'));
      await this.saveStorageState();
      return;
    } catch {
      // Not logged in, proceed with manual login
    }

    console.log(chalk.yellow('Please log in manually in the browser window...'));
    console.log(chalk.gray('Waiting for login to complete...'));
    
    // Wait for user to manually login - wait for URL change from login page
    try {
      await this.page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 300000 });
      
      // Give it a moment for the page to fully load
      await this.page.waitForTimeout(2000);
      
      console.log(chalk.green('Login successful!'));
      await this.saveStorageState();
    } catch (error) {
      console.log(chalk.red('Login timeout or error. Please try again.'));
      throw error;
    }
  }

  private async saveStorageState(): Promise<void> {
    if (!this.context) throw new Error('Context not initialized');
    
    const dir = dirname(this.config.storageStatePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    await this.context.storageState({ path: this.config.storageStatePath });
    console.log(chalk.gray(`Authentication saved to ${this.config.storageStatePath}`));
  }

  async createArticle(title: string, blocks: ParsedContent[], isDraft: boolean = true): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    // Navigate to new article page
    await this.page.goto('https://note.com/notes/new');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000); // Wait for editor to fully load

    // Input title with better handling
    console.log(chalk.blue('Setting article title...'));
    try {
      // Wait a bit more for the editor to fully initialize
      await this.page.waitForTimeout(3000);
      
      // Try to find the title input area
      const titleSet = await this.page.evaluate(async (titleText) => {
        // Look for various possible title elements
        const titleSelectors = [
          'input[placeholder*="タイトル"]',
          'input[placeholder*="title" i]',
          '[contenteditable="true"]:first-of-type',
          '.ProseMirror-title',
          'h1[contenteditable="true"]',
          '[role="textbox"]:first-of-type',
          '.editor-title',
          '[data-placeholder*="タイトル"]'
        ];
        
        for (const selector of titleSelectors) {
          try {
            const element = document.querySelector(selector) as HTMLElement;
            if (element) {
              element.focus();
              element.click();
              
              // Clear existing content
              if ('value' in element) {
                (element as HTMLInputElement).value = '';
                (element as HTMLInputElement).value = titleText;
                element.dispatchEvent(new Event('input', { bubbles: true }));
              } else if (element.contentEditable === 'true') {
                // For contenteditable elements
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(element);
                selection?.removeAllRanges();
                selection?.addRange(range);
                
                // Clear and set new text
                element.textContent = titleText;
                element.dispatchEvent(new Event('input', { bubbles: true }));
              }
              
              return true;
            }
          } catch (err) {
            continue;
          }
        }
        return false;
      }, title);
      
      if (titleSet) {
        console.log(chalk.green('Title set successfully'));
        // Move to content area
        await this.page.keyboard.press('Tab');
      } else {
        // Fallback: Try keyboard input at the beginning
        console.log(chalk.yellow('Trying alternative title input method...'));
        
        // Try to click at the top of the page and type
        await this.page.mouse.click(100, 100);
        await this.page.keyboard.type(title);
        await this.page.keyboard.press('Tab');
      }
    } catch (error) {
      console.log(chalk.yellow('Could not set title. Please set it manually after import.'));
    }

    // Process content blocks
    console.log(chalk.blue('Adding content blocks...'));
    for (const block of blocks) {
      await this.addContentBlock(block);
      await this.page.waitForTimeout(500); // Small delay between blocks
    }

    // Save as draft or publish
    if (isDraft) {
      await this.saveDraft();
    } else {
      // Publishing functionality can be added later
      await this.saveDraft();
      console.log(chalk.yellow('Publishing is not yet implemented. Saved as draft.'));
    }
  }

  private async addContentBlock(block: ParsedContent): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    switch (block.type) {
      case 'heading':
        await this.addHeading(block.content || '', block.level || 2);
        break;
      case 'paragraph':
      case 'text':
        await this.addText(block.content || '');
        break;
      case 'image':
        if (block.src) {
          await this.addImage(block.src, block.alt);
        }
        break;
    }
  }

  private async addHeading(text: string, level: number): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Try to find and click on the main content area
    const contentSelectors = [
      '.ProseMirror',
      '[contenteditable="true"]',
      '.note-body',
      '.editor-content',
      '[role="textbox"]'
    ];
    
    let contentArea = null;
    for (const selector of contentSelectors) {
      try {
        contentArea = await this.page.$(selector);
        if (contentArea) break;
      } catch {
        continue;
      }
    }
    
    if (contentArea) {
      await contentArea.click();
    }
    
    // Add heading markdown style (note may convert it)
    const headingPrefix = '#'.repeat(level) + ' ';
    await this.page.keyboard.type(headingPrefix + text);
    await this.page.keyboard.press('Enter');
    await this.page.keyboard.press('Enter');
  }

  private async addText(text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Try to find and click on the main content area
    const contentSelectors = [
      '.ProseMirror',
      '[contenteditable="true"]',
      '.note-body',
      '.editor-content',
      '[role="textbox"]'
    ];
    
    let contentArea = null;
    for (const selector of contentSelectors) {
      try {
        contentArea = await this.page.$(selector);
        if (contentArea) break;
      } catch {
        continue;
      }
    }
    
    if (contentArea) {
      await contentArea.click();
    }
    
    // Type the text
    await this.page.keyboard.type(text);
    await this.page.keyboard.press('Enter');
    await this.page.keyboard.press('Enter');
  }

  private async addImage(imagePath: string, alt?: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    if (!existsSync(imagePath)) {
      console.log(chalk.yellow(`Image not found: ${imagePath}`));
      return;
    }

    console.log(chalk.gray(`Uploading image: ${imagePath}`));
    
    try {
      // First, ensure we have a clean state
      // Find and click on the content area to focus
      const contentSelectors = [
        '.ProseMirror',
        '[contenteditable="true"]',
        '.note-body',
        '.editor-content',
        '[role="textbox"]'
      ];
      
      let contentArea = null;
      for (const selector of contentSelectors) {
        try {
          contentArea = await this.page.$(selector);
          if (contentArea) break;
        } catch {
          continue;
        }
      }
      
      if (!contentArea) {
        console.log(chalk.yellow('Could not find content area for image upload'));
        return;
      }

      // Click to focus
      await contentArea.click();
      
      // Clear any existing clipboard content first
      await this.page.evaluate(() => {
        // Clear selection if any
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      });
      
      // Method 1: Try drag and drop simulation with file
      const fs = await import('fs/promises');
      const path = await import('path');
      
      try {
        // Use Playwright's file chooser API if there's a hidden file input
        const fileInputs = await this.page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
          // Find the most likely file input (visible or associated with the editor)
          for (const input of fileInputs) {
            try {
              await input.setInputFiles(imagePath);
              // Wait for upload to process
              await this.page.waitForTimeout(3000);
              
              // Check if image was added by looking for img tags
              const imgCount = await this.page.$$eval('img', imgs => imgs.length);
              if (imgCount > 0) {
                console.log(chalk.green(`Image uploaded successfully: ${imagePath}`));
                
                // Move cursor after the image
                await this.page.keyboard.press('ArrowRight');
                await this.page.keyboard.press('Enter');
                return;
              }
            } catch {
              continue;
            }
          }
        }
      } catch (fileInputError) {
        console.log(chalk.gray('File input method failed, trying paste method...'));
      }
      
      // Method 2: Simulate paste with proper clipboard handling
      try {
        const imageBuffer = await fs.readFile(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mimeTypes: { [key: string]: string } = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        const mimeType = mimeTypes[ext] || 'image/png';
        
        // Create and paste image through clipboard
        const pasted = await this.page.evaluate(async ({ base64, mimeType, fileName }) => {
          try {
            // Create blob from base64
            const response = await fetch(`data:${mimeType};base64,${base64}`);
            const blob = await response.blob();
            
            // Try clipboard API first
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
              try {
                const clipboardItem = new ClipboardItem({
                  [mimeType]: blob
                });
                await navigator.clipboard.write([clipboardItem]);
                
                // Focus on the editor
                const editor = document.querySelector('[contenteditable="true"]') || document.activeElement;
                if (editor && editor instanceof HTMLElement) {
                  editor.focus();
                  
                  // Trigger paste
                  document.execCommand('paste');
                  return true;
                }
              } catch (clipErr) {
                console.log('Clipboard API failed:', clipErr);
              }
            }
            
            // Fallback: Create paste event manually
            const file = new File([blob], fileName, { type: mimeType });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dataTransfer as any,
              bubbles: true,
              cancelable: true
            });
            
            const activeElement = document.activeElement || document.querySelector('[contenteditable="true"]');
            if (activeElement) {
              activeElement.dispatchEvent(pasteEvent);
              return true;
            }
            
            return false;
          } catch (err) {
            console.error('Paste error:', err);
            return false;
          }
        }, {
          base64: imageBuffer.toString('base64'),
          mimeType,
          fileName: path.basename(imagePath)
        });
        
        if (pasted) {
          // Wait for image upload to complete by monitoring DOM changes
          const imageUploaded = await this.page.evaluate(async () => {
            const initialImageCount = document.querySelectorAll('img').length;
            
            // Wait for up to 10 seconds for a new image to appear
            for (let i = 0; i < 20; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const currentImageCount = document.querySelectorAll('img').length;
              
              if (currentImageCount > initialImageCount) {
                // Check if the new image is fully loaded
                const images = document.querySelectorAll('img');
                const lastImage = images[images.length - 1] as HTMLImageElement;
                
                // Wait for the image to have a src and be loaded
                if (lastImage && lastImage.src && lastImage.complete) {
                  return true;
                }
              }
              
              // Also check for upload indicators
              const uploadingIndicators = document.querySelectorAll('[class*="upload"], [class*="loading"], [class*="progress"]');
              if (uploadingIndicators.length === 0 && currentImageCount > initialImageCount) {
                return true;
              }
            }
            return false;
          });
          
          if (imageUploaded) {
            console.log(chalk.green(`Image uploaded successfully: ${imagePath}`));
            
            // Additional wait to ensure the editor is ready
            await this.page.waitForTimeout(1000);
            
            // Ensure cursor is after the image
            await this.page.keyboard.press('End');
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
          } else {
            console.log(chalk.yellow(`Image upload may have failed or timed out: ${imagePath}`));
            // Still add some space for the next content
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
          }
        }
      } catch (pasteError) {
        console.log(chalk.yellow(`Paste method failed: ${pasteError}`));
      }
    } catch (error) {
      console.log(chalk.red(`Failed to upload image: ${error}`));
    }
  }

  private async saveDraft(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log(chalk.blue('Saving as draft...'));
    
    try {
      // Try multiple save button selectors
      const saveSelectors = [
        'button:has-text("下書き保存")',
        'button:has-text("保存")',
        'button:has-text("Save")',
        'button[aria-label*="保存"]',
        'button[aria-label*="save" i]',
        '[data-testid="save-button"]',
        '.save-button',
        'button[type="submit"]'
      ];
      
      let saveButton = null;
      for (const selector of saveSelectors) {
        try {
          saveButton = await this.page.waitForSelector(selector, { timeout: 2000 });
          if (saveButton) {
            const isVisible = await saveButton.isVisible();
            if (isVisible) break;
          }
        } catch {
          continue;
        }
      }
      
      if (saveButton) {
        await saveButton.click();
        await this.page.waitForTimeout(3000);
        console.log(chalk.green('Article saved as draft successfully!'));
      } else {
        // Try keyboard shortcut
        console.log(chalk.yellow('Save button not found. Trying keyboard shortcut...'));
        await this.page.keyboard.press('Control+s');
        await this.page.waitForTimeout(3000);
        console.log(chalk.green('Article save attempted via shortcut.'));
      }
    } catch (error) {
      console.log(chalk.yellow('Could not save automatically. Please save manually in the browser.'));
      console.log(chalk.gray('The article content has been added to the editor.'));
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}