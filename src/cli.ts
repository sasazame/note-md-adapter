#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { MarkdownParser } from './lib/markdown-parser.js';
import { NoteClient } from './lib/note-client.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

const program = new Command();

program
  .name('note-md-adapter')
  .description('CLI tool to import Markdown articles to note.com via browser automation')
  .version(packageJson.version)
  .argument('<directory>', 'Directory containing article.md and images folder')
  .option('-t, --title <title>', 'Article title', 'Untitled')
  .option('-s, --status <status>', 'Article status (draft or publish)', 'draft')
  .option('--headless', 'Run browser in headless mode', false)
  .option('--login-only', 'Only perform login and save credentials', false)
  .action(async (directory: string, options) => {
    try {
      // Validate directory
      if (!existsSync(directory)) {
        console.error(chalk.red(`Directory not found: ${directory}`));
        process.exit(1);
      }

      const articlePath = join(directory, 'article.md');
      if (!options.loginOnly && !existsSync(articlePath)) {
        console.error(chalk.red(`article.md not found in ${directory}`));
        process.exit(1);
      }

      // Initialize note client
      const client = new NoteClient({
        headless: options.headless
      });

      console.log(chalk.cyan('Starting note-md-adapter...'));
      await client.initialize();

      // Perform login
      await client.login();

      if (options.loginOnly) {
        console.log(chalk.green('Login completed successfully!'));
        await client.close();
        return;
      }

      // Parse markdown
      console.log(chalk.blue('Parsing Markdown file...'));
      const parser = new MarkdownParser();
      const blocks = await parser.parseMarkdownFile(articlePath);
      console.log(chalk.gray(`Parsed ${blocks.length} content blocks`));

      // Determine title - use first H1 if no title specified or if title is default
      let articleTitle = options.title;
      if (articleTitle === 'Untitled') {
        // Look for first H1 heading in blocks
        const firstHeading = blocks.find(block => block.type === 'heading' && block.level === 1);
        if (firstHeading && firstHeading.content) {
          articleTitle = firstHeading.content;
          console.log(chalk.blue(`Using H1 from markdown as title: "${articleTitle}"`));
          // Remove the H1 from blocks to avoid duplication
          const headingIndex = blocks.indexOf(firstHeading);
          if (headingIndex !== -1) {
            blocks.splice(headingIndex, 1);
          }
        }
      }

      // Create article
      const isDraft = options.status === 'draft';
      console.log(chalk.blue(`Creating article: "${articleTitle}" (${options.status})...`));
      await client.createArticle(articleTitle, blocks, isDraft);

      console.log(chalk.green('Article imported successfully!'));
      console.log(chalk.gray('You can now review and publish it on note.com'));

      await client.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Add login command
program
  .command('login')
  .description('Login to note.com and save credentials')
  .option('--headless', 'Run browser in headless mode', false)
  .action(async (options) => {
    try {
      const client = new NoteClient({
        headless: options.headless
      });

      console.log(chalk.cyan('Starting login process...'));
      await client.initialize();
      await client.login();
      console.log(chalk.green('Login completed successfully!'));
      await client.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse();