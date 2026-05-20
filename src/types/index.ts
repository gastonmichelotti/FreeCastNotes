export type NoteVisibility = 'private' | 'unlisted' | 'public';

export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  last_opened_at?: string;
  is_pinned: number; // 0 or 1 (SQLite boolean)
  pin_order: number;
  tags: string[];
  // Web publishing fields (optional — absent means private)
  visibility?: NoteVisibility;
  edit_permission?: boolean;
  published_slug?: string;
  published_url?: string;
}

export type SortOrder = "modified" | "opened" | "title";

export interface DeletedNote {
  id: string;
  content: string;
  deleted_at: string;
  original_created_at: string;
}
