import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, MapIcon, ChevronRight, RotateCcw } from 'lucide-react';
import { GameState, Room, Entity, Sprite, Tile } from './types';

const TILE_SIZE = 32;
const FPS = 24;
const FRAME_TIME = 1000 / FPS;

interface GameProps {
  rooms: Record<string, Room>;
  tiles: Record<string, Tile>;
  sprites: Record<string, Sprite>;
}

const imageCache: Record<string, HTMLImageElement | HTMLCanvasElement> = {};

export default function Game({ rooms: initialRooms, tiles, sprites }: GameProps) {
  const [rooms, setRooms] = useState<Record<string, Room>>(() => JSON.parse(JSON.stringify(initialRooms)));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => {
    let startX = 1;
    let startY = 1;
    let startRoomId = Object.keys(initialRooms)[0] || 'room1';
    
    for (const roomId in initialRooms) {
      const room = initialRooms[roomId];
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          if (room.tiles[y][x] === 'P') {
            startX = x;
            startY = y;
            startRoomId = roomId;
            break;
          }
        }
      }
    }
    
    return {
      currentRoomId: startRoomId,
      player: { x: startX, y: startY, width: 1, height: 1, direction: 'down', inventory: {}, speed: 4, isMoving: false },
      dialogue: { active: false, text: [], currentIndex: 0 },
      globalFrame: 0,
    };
  });

  const [isReady, setIsReady] = useState(false);
  const [zoom, setZoom] = useState(1); // Default zoom level
  const keysPressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;
      if (e.key === ' ' || e.key === 'Enter') handleInteraction();
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState.dialogue.active]);

  const processActions = useCallback((actions: import('./types').Action[], currentState: GameState, triggerContext?: { triggerType?: import('./types').TriggerType; tileX?: number; tileY?: number }): GameState => {
    let nextState = { ...currentState, pendingActions: [], pendingContext: undefined };
    let newInventory = { ...currentState.player.inventory };
    let teleported = false;

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (action.type === 'consumeItem') {
            newInventory[action.payload.itemId] = Math.max(0, (newInventory[action.payload.itemId] || 0) - action.payload.count);
        } else if (action.type === 'giveItem') {
            newInventory[action.payload.itemId] = (newInventory[action.payload.itemId] || 0) + action.payload.count;
            if (triggerContext?.triggerType === 'enter' && triggerContext.tileX !== undefined && triggerContext.tileY !== undefined) {
                const { tileX, tileY } = triggerContext;
                setRooms(prevRooms => {
                    const roomToModify = prevRooms[nextState.currentRoomId];
                    if (!roomToModify || !roomToModify.tiles[tileY]) return prevRooms;
                    const newRoom = { ...roomToModify };
                    const newTiles = newRoom.tiles.map(row => [...row]);
                    newTiles[tileY][tileX] = 'F';
                    newRoom.tiles = newTiles;
                    return { ...prevRooms, [nextState.currentRoomId]: newRoom };
                });
            }
        } else if (action.type === 'teleport') {
            nextState.currentRoomId = action.payload.roomId;
            nextState.player.x = action.payload.x;
            nextState.player.y = action.payload.y;
            nextState.player.targetX = undefined;
            nextState.player.targetY = undefined;
            teleported = true;
        } else if (action.type === 'dialogue') {
            nextState.dialogue = { active: true, text: action.payload.text, currentIndex: 0 };
            nextState.pendingActions = actions.slice(i + 1);
            nextState.pendingContext = triggerContext;
            break;
        }
    }

    nextState.player.inventory = newInventory;
    if (teleported) nextState.player.isMoving = false;
    return nextState;
  }, [setRooms]);

  const handleInteraction = useCallback(() => {
    setGameState(prev => {
      if (prev.dialogue.active) {
        if (prev.dialogue.currentIndex < prev.dialogue.text.length - 1) {
          return { ...prev, dialogue: { ...prev.dialogue, currentIndex: prev.dialogue.currentIndex + 1 } };
        } else {
          // Finish dialogue
          const nextState = { ...prev, dialogue: { ...prev.dialogue, active: false, text: [], currentIndex: 0 } };
          if (prev.pendingActions && prev.pendingActions.length > 0) {
             return processActions(prev.pendingActions, nextState, prev.pendingContext);
          }
          return nextState;
        }
      }

      const room = rooms[prev.currentRoomId];
      const npc = room.entities.find(e => Math.abs(e.x - prev.player.x) <= 1 && Math.abs(e.y - prev.player.y) <= 1 && e.type === 'npc');
      if (npc && npc.dialogue) return { ...prev, dialogue: { active: true, text: npc.dialogue, currentIndex: 0 } };

      const currentSpriteId = `player_${prev.player.direction}`;
      const playerSprite = sprites[currentSpriteId];
      const playerWidth = (playerSprite?.width || 1) * 0.8;
      const playerHeight = (playerSprite?.height || 1) * 0.8;

      // Check for interact triggers on tiles in front of player
      let targetX = Math.floor(prev.player.x + playerWidth / 2);
      let targetY = Math.floor(prev.player.y + playerHeight / 2);
      if (prev.player.direction === 'up') targetY -= 1;
      if (prev.player.direction === 'down') targetY += 1;
      if (prev.player.direction === 'left') targetX -= 1;
      if (prev.player.direction === 'right') targetX += 1;

      if (targetX >= 0 && targetX < room.width && targetY >= 0 && targetY < room.height) {
        const tileId = room.tiles[targetY][targetX];
        const tile = tiles[tileId];
        if (tile?.trigger && tile.trigger.type === 'interact') {
          for (const event of tile.trigger.events) {
            let conditionMet = true;
            if (event.condition) {
              const count = prev.player.inventory[event.condition.itemId] || 0;
              if (count < event.condition.requiredCount) conditionMet = false;
            }
            if (conditionMet) {
                return processActions(event.actions, prev, { triggerType: 'interact', tileX: targetX, tileY: targetY });
            }
          }
        }
      }

      return prev;
    });
  }, [rooms, sprites, tiles, processActions]);

  const movePlayerGrid = useCallback((dx: number, dy: number) => {
    setGameState(prev => {
      if (prev.dialogue.active || prev.player.targetX !== undefined) return prev;

      const room = rooms[prev.currentRoomId];
      
      let direction = prev.player.direction;
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx > 0 ? 'right' : 'left';
      } else if (Math.abs(dy) > 0) {
        direction = dy > 0 ? 'down' : 'up';
      }

      // Only allow 4-way movement, prioritize horizontal if both
      let moveX = 0;
      let moveY = 0;
      if (dx !== 0) {
        moveX = dx > 0 ? 1 : -1;
      } else if (dy !== 0) {
        moveY = dy > 0 ? 1 : -1;
      }

      if (moveX === 0 && moveY === 0) {
        if (prev.player.direction !== direction) {
           return { ...prev, player: { ...prev.player, direction } };
        }
        return prev;
      }

      const targetX = prev.player.x + moveX;
      const targetY = prev.player.y + moveY;

      const currentSpriteId = `player_${direction}`;
      const playerSprite = sprites[currentSpriteId];
      const playerWidth = playerSprite?.width || 1;
      const playerHeight = playerSprite?.height || 1;
      
      const margin = 0.05;
      const hitBoxWidth = playerWidth - margin * 2;
      const hitBoxHeight = playerHeight - margin * 2;
      const offsetX = margin;
      const offsetY = margin;

      const checkTileCollision = (px: number, py: number) => {
        const left = Math.floor(px + offsetX);
        const right = Math.floor(px + offsetX + hitBoxWidth - 0.001);
        const top = Math.floor(py + offsetY);
        const bottom = Math.floor(py + offsetY + hitBoxHeight - 0.001);
        for (let y = top; y <= bottom; y++) {
          for (let x = left; x <= right; x++) {
            if (x < 0 || x >= room.width || y < 0 || y >= room.height) return true;
            const tileId = room.tiles[y][x];
            if (tiles[tileId]?.isSolid) return true;
          }
        }
        return false;
      };

      const getTriggerTile = (px: number, py: number) => {
        const left = Math.floor(px + offsetX);
        const right = Math.floor(px + offsetX + hitBoxWidth - 0.001);
        const top = Math.floor(py + offsetY);
        const bottom = Math.floor(py + offsetY + hitBoxHeight - 0.001);
        for (let y = top; y <= bottom; y++) {
          for (let x = left; x <= right; x++) {
            if (x >= 0 && x < room.width && y >= 0 && y < room.height) {
               const tileId = room.tiles[y][x];
               if (tiles[tileId]?.isSolid && tiles[tileId]?.trigger) {
                 return {x, y, tileId};
               }
            }
          }
        }
        return null;
      };

      const entityAtPos = room.entities.find(e => {
        const margin = 0.05;
        const eLeft = e.x + margin;
        const eRight = e.x + 1 - margin;
        const eTop = e.y + margin;
        const eBottom = e.y + 1 - margin;
        const pLeft = targetX + offsetX;
        const pRight = targetX + offsetX + hitBoxWidth;
        const pTop = targetY + offsetY;
        const pBottom = targetY + offsetY + hitBoxHeight;
        return pLeft < eRight && pRight > eLeft && pTop < eBottom && pBottom > eTop;
      });

      if (checkTileCollision(targetX, targetY) || entityAtPos) {
        // Handle solid tile triggers even if we can't move there (like locked doors)
        const solidTrigger = getTriggerTile(targetX, targetY);
        if (solidTrigger) {
          const tile = tiles[solidTrigger.tileId];
          if (tile.trigger && tile.trigger.type === 'collision') {
            for (const event of tile.trigger.events) {
                let conditionMet = true;
                if (event.condition) {
                  const count = prev.player.inventory[event.condition.itemId] || 0;
                  if (count < event.condition.requiredCount) conditionMet = false;
                }
                if (conditionMet) {
                    const tempState = { ...prev, player: { ...prev.player, direction, isMoving: false } };
                    return processActions(event.actions, tempState, { triggerType: 'collision', tileX: solidTrigger.x, tileY: solidTrigger.y });
                }
            }
          }
        }

        if (entityAtPos && (entityAtPos.type === 'npc' || entityAtPos.type === 'player')) {
           return { ...prev, player: { ...prev.player, direction, isMoving: false } }; // Stop and face NPC
        }

        return { ...prev, player: { ...prev.player, direction } }; // Just change direction
      }

      // Valid grid move
      return { 
        ...prev, 
        player: { 
          ...prev.player, 
          direction, 
          isMoving: true,
          targetX,
          targetY
        } 
      };
    });
  }, [rooms, tiles, sprites, setRooms]);

  const updateGridMovement = useCallback((deltaTime: number) => {
    setGameState(prev => {
      if (prev.player.targetX === undefined || prev.player.targetY === undefined) return prev;
      
      const speed = 6; // Grid tiles per second
      const moveAmount = speed * deltaTime;
      
      let newX = prev.player.x;
      let newY = prev.player.y;
      let reached = false;

      const dx = prev.player.targetX - newX;
      const dy = prev.player.targetY - newY;

      if (Math.abs(dx) <= moveAmount && Math.abs(dy) <= moveAmount) {
        newX = prev.player.targetX;
        newY = prev.player.targetY;
        reached = true;
      } else {
        if (dx !== 0) newX += Math.sign(dx) * moveAmount;
        if (dy !== 0) newY += Math.sign(dy) * moveAmount;
      }

      let nextState = { ...prev, player: { ...prev.player, x: newX, y: newY } };

      if (reached) {
        nextState.player.targetX = undefined;
        nextState.player.targetY = undefined;
        
        // Handle trigger when we land on the tile exactly
        const room = rooms[nextState.currentRoomId];
        const currentSpriteId = `player_${nextState.player.direction}`;
        const playerSprite = sprites[currentSpriteId];
        const playerWidth = playerSprite?.width || 1;
        const playerHeight = playerSprite?.height || 1;
        
        const centerX = Math.floor(newX + playerWidth / 2);
        const centerY = Math.floor(newY + playerHeight / 2);
        
        if (centerX >= 0 && centerX < room.width && centerY >= 0 && centerY < room.height) {
          const centerTileId = room.tiles[centerY][centerX];
          const centerTile = tiles[centerTileId];
          if (centerTile?.trigger && centerTile.trigger.type === 'enter') {
            for (const event of centerTile.trigger.events) {
              let conditionMet = true;
              if (event.condition) {
                const count = nextState.player.inventory[event.condition.itemId] || 0;
                if (count < event.condition.requiredCount) conditionMet = false;
              }
              if (conditionMet) {
                return processActions(event.actions, nextState, { triggerType: 'enter', tileX: centerX, tileY: centerY });
              }
            }
          }
        }
      }

      return nextState;
    });
  }, [rooms, sprites, tiles, setRooms]);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const loop = (time: number) => {
      const delta = time - lastTime;
      if (delta >= FRAME_TIME) {
        lastTime = time - (delta % FRAME_TIME);
        
        let dx = 0;
        let dy = 0;
        if (keysPressed.current['ArrowUp'] || keysPressed.current['w']) dy -= 1;
        if (keysPressed.current['ArrowDown'] || keysPressed.current['s']) dy += 1;
        if (keysPressed.current['ArrowLeft'] || keysPressed.current['a']) dx -= 1;
        if (keysPressed.current['ArrowRight'] || keysPressed.current['d']) dx += 1;

        if (dx !== 0 || dy !== 0) {
          movePlayerGrid(dx, dy);
        } else {
          setGameState(prev => {
            if (prev.player.targetX === undefined && prev.player.isMoving) {
               return { ...prev, player: { ...prev.player, isMoving: false } };
            }
            return prev;
          });
        }

        updateGridMovement(FRAME_TIME / 1000);
        setGameState(prev => ({ ...prev, globalFrame: prev.globalFrame + 1 }));
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [movePlayerGrid, updateGridMovement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const VIEWPORT_WIDTH = canvas.parentElement?.clientWidth || window.innerWidth;
    const VIEWPORT_HEIGHT = canvas.parentElement?.clientHeight || window.innerHeight;
    if (canvas.width !== VIEWPORT_WIDTH) {
      canvas.width = VIEWPORT_WIDTH;
    }
    if (canvas.height !== VIEWPORT_HEIGHT) {
      canvas.height = VIEWPORT_HEIGHT;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const room = rooms[gameState.currentRoomId];
    if (!room) return;

    const currentSpriteId = `player_${gameState.player.direction}`;
    const playerSprite = sprites[currentSpriteId];
    const playerWidth = (playerSprite?.width || 1);
    const playerHeight = (playerSprite?.height || 1);

    const cameraX = Math.round(gameState.player.x * TILE_SIZE - VIEWPORT_WIDTH / 2 / zoom + (playerWidth * TILE_SIZE) / 2);
    const cameraY = Math.round(gameState.player.y * TILE_SIZE - VIEWPORT_HEIGHT / 2 / zoom + (playerHeight * TILE_SIZE) / 2);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-cameraX, -cameraY);

    const drawSprite = (spriteId: string, x: number, y: number, isPlayer = false, customW?: number, customH?: number) => {
      const sprite = sprites[spriteId];
      if (!sprite) return;
      
      let frameIndex = 0;
      if (isPlayer) {
        if (gameState.player.isMoving) {
          const animSpeedMultiplier = 1.5;
          const frameCount = (sprite.dataUrls && sprite.dataUrls.length > 0) ? sprite.dataUrls.length : sprite.frames.length;
          frameIndex = Math.floor((gameState.globalFrame * animSpeedMultiplier / (FPS / sprite.frameRate)) % frameCount);
        } else {
          frameIndex = 0; // Idle frame
        }
      } else {
        const frameCount = (sprite.dataUrls && sprite.dataUrls.length > 0) ? sprite.dataUrls.length : sprite.frames.length;
        frameIndex = Math.floor((gameState.globalFrame / (FPS / sprite.frameRate)) % frameCount);
      }

      const drawX = Math.round(x * TILE_SIZE);
      const drawY = Math.round(y * TILE_SIZE);

      const urlToDraw = sprite.dataUrls ? sprite.dataUrls[frameIndex] : undefined;
      if (urlToDraw) {
        let img = imageCache[urlToDraw];
        if (!img) {
          img = new Image();
          img.src = urlToDraw;
          imageCache[urlToDraw] = img;
        }
        
        if (img instanceof HTMLImageElement) {
          if (img.complete && img.naturalHeight !== 0) {
            ctx.drawImage(img, drawX, drawY, customW !== undefined ? customW * TILE_SIZE : sprite.width * TILE_SIZE, customH !== undefined ? customH * TILE_SIZE : sprite.height * TILE_SIZE);
          }
        } else {
          ctx.drawImage(img, drawX, drawY, customW !== undefined ? customW * TILE_SIZE : sprite.width * TILE_SIZE, customH !== undefined ? customH * TILE_SIZE : sprite.height * TILE_SIZE);
        }
        return;
      }

      const frame = sprite.frames[frameIndex];
      if (!frame || !frame[0]) return;
      const w = customW !== undefined ? customW * TILE_SIZE : sprite.width * TILE_SIZE;
      const h = customH !== undefined ? customH * TILE_SIZE : sprite.height * TILE_SIZE;
      const cacheKey = `${spriteId}_${frameIndex}_${w}_${h}`;

      if (!imageCache[cacheKey]) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const tCtx = offCanvas.getContext('2d');
        if (tCtx) {
          const pixelWidth = w / frame[0].length;
          const pixelHeight = h / frame.length;
          frame.forEach((row, ry) => {
            row.forEach((color, rx) => {
              if (color !== 'transparent') {
                tCtx.fillStyle = color;
                tCtx.fillRect(rx * pixelWidth, ry * pixelHeight, pixelWidth + 0.5, pixelHeight + 0.5);
              }
            });
          });
        }
        imageCache[cacheKey] = offCanvas;
      }

      ctx.drawImage(imageCache[cacheKey], drawX, drawY, w, h);
    };

    if (room.backgroundTileId && tiles[room.backgroundTileId]) {
      drawSprite(tiles[room.backgroundTileId].spriteId, 0, 0, false, room.width, room.height);
    }

    room.tiles.forEach((row, y) => {
      row.forEach((tileId, x) => {
        if (tileId === 'P') return; // Skip player spawn point
        const tile = tiles[tileId];
        if (tile) drawSprite(tile.spriteId, x, y);
      });
    });

    room.entities.forEach(entity => {
      drawSprite(entity.spriteId, entity.x, entity.y);
    });

    drawSprite(`player_${gameState.player.direction}` in sprites ? `player_${gameState.player.direction}` : 'player_down', gameState.player.x, gameState.player.y, true);
    
    ctx.restore();
    setIsReady(true);
  }, [gameState, rooms, sprites, tiles, zoom]);

  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const restartGame = useCallback(() => {
    setRooms(JSON.parse(JSON.stringify(initialRooms)));
    let startX = 1;
    let startY = 1;
    let startRoomId = Object.keys(initialRooms)[0] || 'room1';
    
    for (const roomId in initialRooms) {
      const room = initialRooms[roomId];
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          if (room.tiles[y][x] === 'P') {
            startX = x;
            startY = y;
            startRoomId = roomId;
          }
        }
      }
    }

    setGameState({
      currentRoomId: startRoomId,
      player: { x: startX, y: startY, width: 1, height: 1, direction: 'down', inventory: {}, speed: 4, isMoving: false },
      dialogue: { active: false, text: [], currentIndex: 0 },
      globalFrame: 0,
    });
    setShowRestartConfirm(false);
  }, [initialRooms]);

  return (
    <div className="flex flex-col items-center justify-center font-sans w-full h-full bg-black">
        <header className="absolute top-6 left-6 z-20 flex flex-col items-start gap-2">
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => setShowRestartConfirm(true)}
              className="flex items-center gap-2 bg-neutral-900/80 hover:bg-neutral-800 transition-colors backdrop-blur-md px-4 py-2 rounded border border-neutral-700 shadow-2xl text-neutral-300 text-xs font-bold uppercase tracking-widest"
            >
              <RotateCcw size={14} /> Restart
            </button>
            <div className="flex items-center bg-neutral-900/80 backdrop-blur-md rounded border border-neutral-700 shadow-2xl text-neutral-300 text-xs font-bold">
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="px-3 py-2 hover:bg-neutral-800 rounded-l transition-colors">-</button>
              <span className="px-2 select-none tracking-widest">{zoom}x</span>
              <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="px-3 py-2 hover:bg-neutral-800 rounded-r transition-colors">+</button>
            </div>
          </div>
          {Object.entries(gameState.player.inventory).filter(([_, count]) => (count as number) > 0).map(([itemId, count]) => {
            const tile = tiles[itemId];
            const name = tile?.name || itemId;
            return (
              <div key={itemId} className="flex items-center gap-3 bg-neutral-900/80 backdrop-blur-md px-4 py-2 rounded border border-neutral-700 shadow-2xl">
                <span className="text-xs uppercase tracking-widest text-neutral-400">{name}</span>
                <span className="text-sm font-mono text-white bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">{count}</span>
              </div>
            );
          })}
        </header>

        {showRestartConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg shadow-2xl flex flex-col items-center max-w-sm text-center">
              <RotateCcw className="w-12 h-12 text-red-500 mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Restart Game?</h3>
              <p className="text-sm text-neutral-400 mb-6">Are you sure you want to restart? You will lose all your current progress and inventory.</p>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => setShowRestartConfirm(false)}
                  className="flex-1 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={restartGame}
                  className="flex-1 py-2 rounded bg-red-600 hover:bg-red-700 text-sm font-bold transition-colors text-white"
                >
                  Restart
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
             <canvas 
               ref={canvasRef} 
               className="image-pixelated w-full h-full object-contain"
             />
            
            <AnimatePresence>
              {gameState.dialogue.active && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-neutral-900/95 backdrop-blur-sm border-2 border-neutral-700 p-6 rounded-lg shadow-2xl z-10"
                >
                  <div className="flex gap-4 items-start">
                    <div className="w-12 h-12 bg-neutral-800 rounded-lg flex items-center justify-center border border-neutral-700 shrink-0">
                      <MessageSquare className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base leading-relaxed text-neutral-200">
                        {gameState.dialogue.text[gameState.dialogue.currentIndex]}
                      </p>
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={handleInteraction}
                          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                        >
                          Press Space to continue <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .image-pixelated {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}} />
    </div>
  );
}
