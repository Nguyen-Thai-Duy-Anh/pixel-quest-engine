import { Action, TriggerEvent, GameTrigger, Room, Tile, Sprite } from './types';

function coordsToPlacement(x: number, y: number): string {
    let letter = '';
    let temp = x;
    while (temp >= 0) {
        letter = String.fromCharCode(65 + (temp % 26)) + letter;
        temp = Math.floor(temp / 26) - 1;
    }
    return `${letter}${y + 1}`;
}

function placementToCoords(placement: string): {x: number, y: number} {
    const match = placement.trim().match(/^([A-Z]+)(\d+)$/);
    if (!match) return {x: 0, y: 0};
    const colStr = match[1];
    let x = 0;
    for (let i = 0; i < colStr.length; i++) {
        x = x * 26 + (colStr.charCodeAt(i) - 64);
    }
    x -= 1;
    const y = parseInt(match[2]) - 1;
    return {x, y};
}

const parseCSVRow = (text: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i+1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const escapeCSV = (str: string) => {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const serializeActions = (actions: Action[]) => {
  if (!actions || actions.length === 0) return 'FALSE';
  return actions.map(a => {
    if (a.type === 'dialogue') return `Dialogue_${a.payload.text.join('|')}`;
    if (a.type === 'teleport') return `Teleport_${a.payload.roomId}`;
    if (a.type === 'giveItem') return `Give_${a.payload.itemId}`; 
    if (a.type === 'consumeItem') return `Consume_${a.payload.itemId}`;
    return 'Unknown';
  }).join('/');
};

const parseActions = (actionStr: string): Action[] => {
  if (!actionStr || actionStr === 'FALSE' || actionStr.trim() === '') return [];
  const parts = actionStr.split('/');
  return parts.map(p => {
    if (p.startsWith('Dialogue_')) {
      const text = p.substring('Dialogue_'.length).split('|').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      return { type: 'dialogue', payload: { text } };
    }
    if (p.startsWith('Teleport_')) {
      const roomId = p.substring('Teleport_'.length);
      return { type: 'teleport', payload: { roomId, x: 0, y: 0 } };
    }
    if (p.startsWith('Give_')) {
      const itemId = p.substring('Give_'.length);
      return { type: 'giveItem', payload: { itemId, count: 1 } };
    }
    if (p.startsWith('Consume_')) {
      const itemId = p.substring('Consume_'.length);
      return { type: 'consumeItem', payload: { itemId, count: 1 } };
    }
    return null;
  }).filter(Boolean) as Action[];
};

const serializeCondition = (condition: any) => {
  if (!condition) return 'Always (No Condition)';
  return `Requires Item_${condition.itemId}`;
}

const parseCondition = (condStr: string) => {
  if (!condStr || condStr === 'FALSE' || condStr === 'Always (No Condition)' || condStr.trim() === '') return null;
  if (condStr.startsWith('Requires ')) {
    // "Requires Item_key_1" -> "Item_key_1"
    const itemId = condStr.substring('Requires '.length); 
    // Wait, the user example says "Requires Item_key_1" -> we expect "Item_key_1" or "key_1"?
    // Let's assume the itemId used in the system will just use whatever is after "Requires "
    return { itemId, requiredCount: 1 }; 
  }
  return null;
};

export const exportAllRoomsCSV = (rooms: Record<string, Room>, tiles: Record<string, Tile>, sprites: Record<string, Sprite>) => {
    let csvContent = 'map,tile name,sprite,category,Placement,solid collision,trigger type,event 1,event 1,event 2,event 2,event 3,event 3\n';
    csvContent += ',,,,,,,condition,actions,condition,actions,condition,actions\n';

    Object.values(rooms).forEach(room => {
        // Collect tile placements for this room
        const tilePlacements: Record<string, string[]> = {};
        for (let y = 0; y < room.height; y++) {
            for (let x = 0; x < room.width; x++) {
                const tileId = room.tiles[y][x];
                if (tileId === 'F' || !tiles[tileId]) continue; // Skip default floor/empty
                if (!tilePlacements[tileId]) tilePlacements[tileId] = [];
                tilePlacements[tileId].push(coordsToPlacement(x, y));
            }
        }

        Object.keys(tilePlacements).forEach(tileId => {
            const t = tiles[tileId];
            const s = sprites[t.spriteId];
            const placements = tilePlacements[tileId].join('/');
            
            let typeStr = 'No Trigger';
            if (t.trigger) {
                if (t.trigger.type === 'collision') typeStr = 'On Collision';
                if (t.trigger.type === 'interact') typeStr = 'On Interact';
                if (t.trigger.type === 'enter') typeStr = 'On Enter';
            }

            const e1 = t.trigger?.events[0];
            const e2 = t.trigger?.events[1];
            const e3 = t.trigger?.events[2];

            const row = [
                room.name,
                t.name || tileId,
                s?.name || t.spriteId,
                t.category === 'character' ? 'Character' : t.category === 'item' ? 'Item' : t.category === 'background' ? 'Background' : 'Tile',
                placements,
                t.isSolid ? 'TRUE' : 'FALSE',
                typeStr,
                e1 ? serializeCondition(e1.condition) : 'FALSE',
                e1 ? serializeActions(e1.actions) : 'FALSE',
                e2 ? serializeCondition(e2.condition) : 'FALSE',
                e2 ? serializeActions(e2.actions) : 'FALSE',
                e3 ? serializeCondition(e3.condition) : 'FALSE',
                e3 ? serializeActions(e3.actions) : 'FALSE',
            ];

            csvContent += row.map(r => escapeCSV(r)).join(',') + '\n';
        });
    });

    return csvContent;
}

export const importAllRoomsCSV = (csvContent: string, currentRooms: Record<string, Room>, currentTiles: Record<string, Tile>, currentSprites: Record<string, Sprite>) => {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) throw new Error("Invalid CSV Format");

    const newTiles = { ...currentTiles };
    const newSprites = { ...currentSprites };
    const newRooms = { ...currentRooms };

    // Group rows by roomName
    const roomPlacementsMap: Record<string, { x: number, y: number, tileId: string }[]> = {};
    const roomMaxCoords: Record<string, { maxX: number, maxY: number }> = {};

    for (let i = 2; i < lines.length; i++) {
        const row = parseCSVRow(lines[i].trim());
        if (row.length < 13) continue;

        const roomName = row[0] || "Imported Room";
        if (!roomPlacementsMap[roomName]) {
            roomPlacementsMap[roomName] = [];
            roomMaxCoords[roomName] = { maxX: 0, maxY: 0 };
        }

        const tileName = row[1];
        const spriteName = row[2];
        const catStr = row[3];
        let category: 'tile' | 'character' | 'item' | 'background' = 'tile';
        if (catStr === 'Character') category = 'character';
        if (catStr === 'Item') category = 'item';
        if (catStr === 'Background') category = 'background';

        const placementsStr = row[4];
        const isSolid = row[5].toUpperCase() === 'TRUE';
        const triggerTypeStr = row[6];
        
        let typeVal: 'collision' | 'interact' | 'enter' | null = null;
        if (triggerTypeStr === 'On Collision') typeVal = 'collision';
        if (triggerTypeStr === 'On Interact') typeVal = 'interact';
        if (triggerTypeStr === 'On Enter') typeVal = 'enter';

        const events: TriggerEvent[] = [];
        for (let eIdx = 0; eIdx < 3; eIdx++) {
            const condStr = row[7 + eIdx * 2];
            const actStr = row[8 + eIdx * 2];
            if (condStr !== 'FALSE' || actStr !== 'FALSE') {
                events.push({
                    condition: parseCondition(condStr),
                    actions: parseActions(actStr)
                });
            }
        }

        // Find or create sprite
        let spriteId = Object.keys(newSprites).find(id => newSprites[id].name === spriteName);
        if (!spriteId) {
            spriteId = `item_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            newSprites[spriteId] = {
                id: spriteId,
                name: spriteName || 'New Sprite',
                frames: [[[]]],
                frameRate: 1, width: 1, height: 1
            };
        }

        // Find or create tile
        let tileId = Object.keys(newTiles).find(id => newTiles[id].name === tileName && newTiles[id].spriteId === spriteId);
        if (!tileId) {
            tileId = `t_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        }
        
        const trigger: GameTrigger | undefined = typeVal ? { type: typeVal, events } : undefined;

        newTiles[tileId] = {
            id: tileId,
            name: tileName,
            spriteId,
            category,
            isSolid,
            trigger,
        };

        const placements = placementsStr.split('/').filter(Boolean);
        for (const p of placements) {
            const coords = placementToCoords(p);
            if (coords.x > roomMaxCoords[roomName].maxX) roomMaxCoords[roomName].maxX = coords.x;
            if (coords.y > roomMaxCoords[roomName].maxY) roomMaxCoords[roomName].maxY = coords.y;
            roomPlacementsMap[roomName].push({ x: coords.x, y: coords.y, tileId });
        }
    }

    let firstNewRoomId = null;

    Object.keys(roomPlacementsMap).forEach((roomName, idx) => {
        // Try to find an existing room with this name or create a new one
        let roomId = Object.keys(newRooms).find(id => newRooms[id].name === roomName);
        if (!roomId) {
            roomId = `r_${Date.now()}_${idx}`;
        }
        if (!firstNewRoomId) firstNewRoomId = roomId;

        const maxCoords = roomMaxCoords[roomName];
        let width = Math.max(maxCoords.maxX + 1, 10);
        let height = Math.max(maxCoords.maxY + 1, 10);
        
        // If room already existed, potentially expand its dimensions
        if (newRooms[roomId]) {
            width = Math.max(width, newRooms[roomId].width);
            height = Math.max(height, newRooms[roomId].height);
        }

        const tilesGrid = Array(height).fill(0).map(() => Array(width).fill('F'));

        // If reusing an existing room, copy old tiles
        if (newRooms[roomId] && newRooms[roomId].tiles) {
            for (let y = 0; y < newRooms[roomId].height; y++) {
                for (let x = 0; x < newRooms[roomId].width; x++) {
                    if (y < height && x < width && newRooms[roomId].tiles[y] && newRooms[roomId].tiles[y][x]) {
                        tilesGrid[y][x] = newRooms[roomId].tiles[y][x];
                    }
                }
            }
        }

        // Apply new placements, overwriting existing ties in those spots
        for (const p of roomPlacementsMap[roomName]) {
            if (p.y < height && p.x < width) {
                tilesGrid[p.y][p.x] = p.tileId;
            }
        }

        newRooms[roomId] = {
            id: roomId,
            name: roomName,
            width,
            height,
            tiles: tilesGrid,
            entities: newRooms[roomId] ? newRooms[roomId].entities : []
        };
    });

    return { newRooms, newTiles, newSprites, newRoomId: firstNewRoomId || Object.keys(newRooms)[0] };
}
