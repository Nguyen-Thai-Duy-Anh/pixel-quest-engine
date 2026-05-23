
import { Sprite, Tile, Room } from './types';

// Simple 8x8 pixel sprites
const createPixelSprite = (color: string, pattern: string[]): string[][] => {
  return pattern.map(row => row.split('').map(char => char === '1' ? color : 'transparent'));
};

export const SPRITES: Record<string, Sprite> = {
  'player_down': {
    id: 'player_down',
    name: 'Player Down',
    frames: [
      createPixelSprite('#3b82f6', [
        '00111100',
        '01111110',
        '11011011',
        '11111111',
        '11111111',
        '01111110',
        '01000010',
        '01000010',
      ]),
      createPixelSprite('#3b82f6', [
        '00111100',
        '01111110',
        '11011011',
        '11111111',
        '11111111',
        '01111110',
        '11000011',
        '00000000',
      ]),
    ],
    frameRate: 4,
    width: 1,
    height: 1,
  },
  'wall': {
    id: 'wall',
    name: 'Wall',
    frames: [
      createPixelSprite('#4b5563', [
        '11111111',
        '10000001',
        '10111101',
        '10111101',
        '10111101',
        '10111101',
        '10000001',
        '11111111',
      ])
    ],
    frameRate: 1,
    width: 1,
    height: 1,
  },
  'floor': {
    id: 'floor',
    name: 'Floor',
    frames: [
      createPixelSprite('#1f2937', [
        '00000000',
        '00000000',
        '00000000',
        '00000000',
        '00000000',
        '00000000',
        '00000000',
        '00000000',
      ])
    ],
    frameRate: 1,
    width: 1,
    height: 1,
  },
  'key': {
    id: 'key',
    name: 'Key',
    frames: [
      createPixelSprite('#fbbf24', [
        '00011000',
        '00100100',
        '00100100',
        '00011000',
        '00010000',
        '00011000',
        '00010000',
        '00011000',
      ])
    ],
    frameRate: 2,
    width: 1,
    height: 1,
  },
  'door': {
    id: 'door',
    name: 'Door',
    frames: [
      createPixelSprite('#92400e', [
        '11111111',
        '11111111',
        '11111111',
        '11110011',
        '11110011',
        '11111111',
        '11111111',
        '11111111',
      ])
    ],
    frameRate: 1,
    width: 1,
    height: 1,
  },
  'npc': {
    id: 'npc',
    name: 'NPC',
    frames: [
      createPixelSprite('#ef4444', [
        '00111100',
        '01111110',
        '11011011',
        '11111111',
        '11111111',
        '01111110',
        '01000010',
        '01000010',
      ])
    ],
    frameRate: 2,
    width: 1,
    height: 1,
  }
};

export const TILES: Record<string, Tile> = {
  'W': { id: 'W', spriteId: 'wall', isSolid: true, category: 'tile' },
  'F': { id: 'F', spriteId: 'floor', isSolid: false, category: 'tile' },
  'D': { 
    id: 'D', 
    spriteId: 'door', 
    isSolid: true,
    category: 'tile',
    trigger: {
      type: 'collision',
      events: [
        {
          condition: { itemId: 'key', requiredCount: 1 },
          actions: [
            { type: 'consumeItem', payload: { itemId: 'key', count: 1 } },
            { type: 'dialogue', payload: { text: ['You unlocked the door!'] } },
            { type: 'teleport', payload: { roomId: 'room2', x: 1, y: 1 } }
          ]
        },
        {
          condition: null,
          actions: [
            { type: 'dialogue', payload: { text: ['The door is locked.', 'You need 1 key.'] } }
          ]
        }
      ]
    }
  },
  'K': {
    id: 'K',
    spriteId: 'key',
    isSolid: false,
    category: 'item',
    trigger: {
      type: 'enter',
      events: [
        {
          condition: null,
          actions: [
            { type: 'giveItem', payload: { itemId: 'key', count: 1 } },
            { type: 'dialogue', payload: { text: ['You found a key!'] } }
          ]
        }
      ]
    }
  },
  'P': {
    id: 'P',
    spriteId: 'player_down',
    isSolid: false,
    category: 'character'
  },
  'N': {
    id: 'N',
    spriteId: 'npc',
    isSolid: true,
    category: 'character',
    trigger: {
      type: 'interact',
      events: [
        {
          condition: null,
          actions: [
            { type: 'dialogue', payload: { text: ['Hello there!', 'Welcome to Pixel Quest.'] } }
          ]
        }
      ]
    }
  }
};

export const ROOMS: Record<string, Room> = {
  'room1': {
    id: 'room1',
    name: 'The Dungeon Entrance',
    width: 10,
    height: 10,
    tiles: [
      ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
      ['W', 'F', 'F', 'F', 'W', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'W', 'F', 'W', 'F', 'W', 'W', 'F', 'W'],
      ['W', 'F', 'W', 'F', 'F', 'F', 'F', 'W', 'F', 'W'],
      ['W', 'F', 'W', 'W', 'W', 'W', 'F', 'W', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'N', 'F', 'F', 'F', 'W'],
      ['W', 'W', 'W', 'W', 'F', 'W', 'W', 'W', 'F', 'W'],
      ['W', 'K', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'D', 'W'],
      ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    ],
    entities: []
  },
  'room2': {
    id: 'room2',
    name: 'The Secret Chamber',
    width: 8,
    height: 8,
    tiles: [
      ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'N', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
      ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    ],
    entities: []
  }
};
