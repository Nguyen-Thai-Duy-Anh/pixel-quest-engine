
export type SpriteData = string[][]; // 2D array of hex colors

export interface Sprite {
  id: string;
  name: string;
  frames: SpriteData[];
  dataUrl?: string;
  dataUrls?: string[];
  frameRate: number; // frames per second
  width: number;
  height: number;
}

export interface Tile {
  id: string;
  name?: string;
  spriteId: string;
  isSolid: boolean;
  category?: 'character' | 'tile' | 'item' | 'background';
  trigger?: GameTrigger;
}

export interface InventoryItem {
  id: string;
  name: string;
  icon: string; // hex color or simple emoji
  count: number;
}

export type TriggerType = 'collision' | 'interact' | 'enter';

export type Action =
  | { type: 'dialogue'; payload: { text: string[] } }
  | { type: 'teleport'; payload: { roomId: string; x: number; y: number } }
  | { type: 'giveItem'; payload: { itemId: string; count: number } }
  | { type: 'consumeItem'; payload: { itemId: string; count: number } };

export interface TriggerEvent {
  condition: {
    itemId: string;
    requiredCount: number;
  } | null;
  actions: Action[];
}

export interface GameTrigger {
  type: TriggerType;
  events: TriggerEvent[];
}

export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: string[][]; // 2D array of tile IDs
  backgroundTileId?: string;
  entities: Entity[];
}

export interface Entity {
  id: string;
  type: 'player' | 'npc' | 'item';
  x: number;
  y: number;
  width: number;
  height: number;
  spriteId: string;
  dialogue?: string[];
}

export interface GameState {
  currentRoomId: string;
  player: {
    x: number;
    y: number;
    targetX?: number;
    targetY?: number;
    width: number;
    height: number;
    direction: 'up' | 'down' | 'left' | 'right';
    inventory: Record<string, number>;
    speed: number;
    isMoving: boolean;
  };
  dialogue: {
    active: boolean;
    text: string[];
    currentIndex: number;
  };
  pendingActions: Action[];
  pendingContext?: {
    triggerType?: TriggerType;
    tileX?: number;
    tileY?: number;
  };
  globalFrame: number;
}

declare global {
  interface Window {
    __EXPORT_DATA__?: {
      rooms: Record<string, Room>;
      tiles: Record<string, Tile>;
      sprites: Record<string, Sprite>;
    };
  }
}
