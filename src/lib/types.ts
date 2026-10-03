export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'note';

export interface Block {
  id: string;
  type: ElementType;
  text: string;
}

export interface Scene {
  id: string;
  projectId: string;
  episodeId: string;
  title: string;
  order: number;
  synopsis: string;
  blocks: Block[];
}

export interface Episode {
  id: string;
  projectId: string;
  seriesId: string;
  number: number;
  title: string;
  order: number;
}

export interface Series {
  id: string;
  projectId: string;
  title: string;
  order: number;
}

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
}

export interface CharacterProfile {
  id: string;
  projectId: string;
  name: string;
  description: string;
  notes: string;
}

export interface Beat {
  id: string;
  projectId: string;
  episodeId: string;
  act: string;
  title: string;
  description: string;
  order: number;
}

export interface Idea {
  id: string;
  projectId: string;
  text: string;
  tags: string[];
  createdAt: number;
}

export interface AttachmentMeta {
  id: string;
  projectId: string;
  name: string;
  size: number;
  contentType: string;
  createdAt: number;
}

export type EntityKind =
  | 'project'
  | 'series'
  | 'episode'
  | 'scene'
  | 'character'
  | 'beat'
  | 'idea';

/** In-memory document: all entities of one user's workspace, keyed by id. */
export interface Doc {
  projects: Record<string, Project>;
  series: Record<string, Series>;
  episodes: Record<string, Episode>;
  scenes: Record<string, Scene>;
  characters: Record<string, CharacterProfile>;
  beats: Record<string, Beat>;
  ideas: Record<string, Idea>;
}

/** One row in the sync store (D1 `objects` table) / one wire record. */
export interface SyncRecord {
  id: string;
  kind: EntityKind;
  projectId: string;
  parentId: string | null;
  rev: number;
  data: unknown;
  updatedAt: number;
  deleted: boolean;
}
