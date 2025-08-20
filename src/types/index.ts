export interface ArticleOptions {
  title: string;
  status: 'draft' | 'publish';
  articlePath: string;
}

export interface ParsedContent {
  type: 'text' | 'heading' | 'image' | 'paragraph';
  content?: string;
  level?: number;
  src?: string;
  alt?: string;
}

export interface Config {
  storageStatePath: string;
  headless: boolean;
}