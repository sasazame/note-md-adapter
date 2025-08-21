import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import type { ParsedContent } from '../types/index.js';

export class MarkdownParser {
  private processor = remark().use(remarkHtml);

  async parseMarkdownFile(filePath: string): Promise<ParsedContent[]> {
    const content = await readFile(filePath, 'utf-8');
    const html = await this.processor.process(content);
    return this.parseHtmlToBlocks(html.toString(), dirname(filePath));
  }

  private parseHtmlToBlocks(html: string, baseDir: string): ParsedContent[] {
    const blocks: ParsedContent[] = [];
    
    // Simple HTML parsing without browser DOM
    // Split by common block elements
    const lines = html.split('\n');
    let currentBlock = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Heading detection
      const headingMatch = trimmed.match(/^<h(\d)>(.*?)<\/h\d>$/);
      if (headingMatch) {
        if (currentBlock) {
          blocks.push({ type: 'paragraph', content: currentBlock });
          currentBlock = '';
        }
        blocks.push({
          type: 'heading',
          level: parseInt(headingMatch[1]),
          content: this.stripHtml(headingMatch[2])
        });
        continue;
      }
      
      // Image detection
      const imgMatch = trimmed.match(/<img\s+src="([^"]+)"(?:\s+alt="([^"]*)")?/);
      if (imgMatch) {
        if (currentBlock) {
          blocks.push({ type: 'paragraph', content: currentBlock });
          currentBlock = '';
        }
        // Use the path from markdown directly, resolving relative to the markdown file location
        const imagePath = imgMatch[1].startsWith('/') ? imgMatch[1] : join(baseDir, imgMatch[1]);
        blocks.push({
          type: 'image',
          src: imagePath,
          alt: imgMatch[2] || ''
        });
        continue;
      }
      
      // Paragraph detection
      if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
        if (currentBlock) {
          blocks.push({ type: 'paragraph', content: currentBlock });
          currentBlock = '';
        }
        blocks.push({
          type: 'paragraph',
          content: this.stripHtml(trimmed.slice(3, -4))
        });
        continue;
      }
      
      // Accumulate other content
      if (trimmed && !trimmed.startsWith('<') && !trimmed.endsWith('>')) {
        currentBlock += (currentBlock ? '\n' : '') + trimmed;
      }
    }
    
    // Add remaining content
    if (currentBlock) {
      blocks.push({ type: 'paragraph', content: currentBlock });
    }
    
    return blocks.filter(block => 
      (block.type === 'image') || 
      (block.content && block.content.trim().length > 0)
    );
  }
  
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}