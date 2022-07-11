export enum Tables {
  BlockRange = 'BlockRange',
  TagMap = 'TagMap',
  Tag = 'Tag',
  UserMark = 'UserMark',
  Note = 'Note',
  Bookmark = 'Bookmark',
  Location = 'Location',
  InputField = 'InputField',
}

export interface ForeignKeyData {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}
