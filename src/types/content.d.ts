export interface Post {
  id: string;
  type: 'post';
  title: string;
  content: string;
  media: string[];
  author: string;
  publishedAt: string;
  updatedAt?: string;
}

export interface Story {
  id: string;
  type: 'story';
  media: string[];
  author?: string;
  publishedAt: string;
  expiresAt: string;
}

export interface Feed {
  version: number;
  generatedAt: string;
  posts: Post[];
  stories: Story[];
}
