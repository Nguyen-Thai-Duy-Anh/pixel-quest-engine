import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Room, Tile, Sprite } from './types';
import { Plus, Upload, Trash2, Save, Map as MapIcon, Image as ImageIcon, LayoutGrid, GripVertical } from 'lucide-react';
import { exportAllRoomsCSV, importAllRoomsCSV } from './csvUtil';

interface EditorProps {
  rooms: Record<string, Room>;
  setRooms: React.Dispatch<React.SetStateAction<Record<string, Room>>>;
  tiles: Record<string, Tile>;
  setTiles: React.Dispatch<React.SetStateAction<Record<string, Tile>>>;
  sprites: Record<string, Sprite>;
  setSprites: React.Dispatch<React.SetStateAction<Record<string, Sprite>>>;
}

const imageCache: Record<string, HTMLImageElement | HTMLCanvasElement> = {};

export default function Editor({ rooms, setRooms, tiles, setTiles, sprites, setSprites }: EditorProps) {
  const [activeTab, setActiveTab] = useState<'rooms' | 'tiles' | 'sprites'>('rooms');
  const [currentRoomId, setCurrentRoomId] = useState<string>(Object.keys(rooms)[0]);
  const [selectedTileId, setSelectedTileId] = useState<string>(Object.keys(tiles)[0]);
  const [selectedSpriteId, setSelectedSpriteId] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [roomEditMode, setRoomEditMode] = useState<'paint' | 'select'>('paint');
  const [selectionStart, setSelectionStart] = useState<{x: number, y: number} | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{x: number, y: number} | null>(null);
  const [clipboard, setClipboard] = useState<string[][] | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [hoverPos, setHoverPos] = useState<{x: number, y: number} | null>(null);
  const [highlightedTiles, setHighlightedTiles] = useState<{x: number, y: number}[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const historyRef = useRef<Record<string, Room>[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const currentRoom = rooms[currentRoomId];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'rooms') return;
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1;
            setRooms(historyRef.current[historyIndexRef.current]);
          }
        } else if (e.key === 'x') {
          e.preventDefault();
          if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current += 1;
            setRooms(historyRef.current[historyIndexRef.current]);
          }
        } else if (e.key === 'c') {
          if (selectionStart && selectionEnd) {
            e.preventDefault();
            const minX = Math.min(selectionStart.x, selectionEnd.x);
            const maxX = Math.max(selectionStart.x, selectionEnd.x);
            const minY = Math.min(selectionStart.y, selectionEnd.y);
            const maxY = Math.max(selectionStart.y, selectionEnd.y);
            const clip: string[][] = [];
            for (let y = minY; y <= Math.min(maxY, currentRoom.height - 1); y++) {
              const row: string[] = [];
              for (let x = minX; x <= Math.min(maxX, currentRoom.width - 1); x++) {
                row.push(currentRoom.tiles[y][x]);
              }
              clip.push(row);
            }
            setClipboard(clip);
          }
        } else if (e.key === 'v') {
          e.preventDefault();
          if (clipboard) {
            setIsPasting(true);
            setRoomEditMode('paint');
          }
        } else if (e.key === 'a') {
          e.preventDefault();
          const newHighlights: {x: number, y: number}[] = [];
          for (let y = 0; y < currentRoom.height; y++) {
            for (let x = 0; x < currentRoom.width; x++) {
              if (currentRoom.tiles[y][x] === selectedTileId) {
                newHighlights.push({x, y});
              }
            }
          }
          setHighlightedTiles(newHighlights);
        } else if (e.key === 's') {
          e.preventDefault();
          if (hoverPos) {
            const targetTileId = currentRoom.tiles[hoverPos.y]?.[hoverPos.x];
            if (targetTileId === selectedTileId) {
              const newHighlights: {x: number, y: number}[] = [];
              const visited = new Set<string>();
              const queue = [{x: hoverPos.x, y: hoverPos.y}];
              
              while (queue.length > 0) {
                const {x, y} = queue.shift()!;
                const key = `${x},${y}`;
                if (visited.has(key)) continue;
                visited.add(key);
                
                if (x >= 0 && x < currentRoom.width && y >= 0 && y < currentRoom.height) {
                  if (currentRoom.tiles[y][x] === selectedTileId) {
                    newHighlights.push({x, y});
                    queue.push({x: x + 1, y});
                    queue.push({x: x - 1, y});
                    queue.push({x, y: y + 1});
                    queue.push({x, y: y - 1});
                  }
                }
              }
              setHighlightedTiles(newHighlights);
            }
          }
        }
      } else if (e.key === 'q' || e.key === 'Q') {
        setRoomEditMode(prev => prev === 'paint' ? 'select' : 'paint');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (highlightedTiles.length > 0) {
          e.preventDefault();
          updateRooms(prev => {
            const room = prev[currentRoomId];
            const newTiles = room.tiles.map(row => [...row]);
            highlightedTiles.forEach(({x, y}) => {
              newTiles[y][x] = 'F';
            });
            return { ...prev, [currentRoomId]: { ...room, tiles: newTiles } };
          });
          setHighlightedTiles([]);
        } else if (selectionStart && selectionEnd) {
          e.preventDefault();
          updateRooms(prev => {
            const room = prev[currentRoomId];
            const newTiles = room.tiles.map(row => [...row]);
            const minX = Math.min(selectionStart.x, selectionEnd.x);
            const maxX = Math.max(selectionStart.x, selectionEnd.x);
            const minY = Math.min(selectionStart.y, selectionEnd.y);
            const maxY = Math.max(selectionStart.y, selectionEnd.y);
            for (let y = minY; y <= Math.min(maxY, room.height - 1); y++) {
              for (let x = minX; x <= Math.min(maxX, room.width - 1); x++) {
                newTiles[y][x] = 'F';
              }
            }
            return { ...prev, [currentRoomId]: { ...room, tiles: newTiles } };
          });
          setSelectionStart(null);
          setSelectionEnd(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentRoom, selectionStart, selectionEnd, clipboard, selectedTileId, hoverPos, highlightedTiles, currentRoomId]);

  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = [rooms];
      historyIndexRef.current = 0;
    }
  }, [rooms]);

  const updateRooms = useCallback((newRooms: Record<string, Room> | ((prev: Record<string, Room>) => Record<string, Room>)) => {
    setRooms(prev => {
      const nextRooms = typeof newRooms === 'function' ? newRooms(prev) : newRooms;
      if (nextRooms !== prev) {
        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        nextHistory.push(nextRooms);
        if (nextHistory.length > 50) nextHistory.shift();
        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;
      }
      return nextRooms;
    });
  }, [setRooms]);

  const handleRoomResize = (width: number, height: number) => {
    updateRooms(prev => {
      const room = prev[currentRoomId];
      const newTiles = [...room.tiles];
      
      // Expand rows if needed
      while (newTiles.length < height) {
        newTiles.push(Array(Math.max(width, room.width)).fill('F'));
      }
      
      // Expand columns if needed
      for (let y = 0; y < newTiles.length; y++) {
        const row = [...newTiles[y]];
        while (row.length < width) {
          row.push('F');
        }
        newTiles[y] = row;
      }
      
      return { ...prev, [currentRoomId]: { ...room, width, height, tiles: newTiles } };
    });
  };

  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>, type: 'down' | 'move' | 'up' | 'leave') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / 32);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / 32);

    if (type === 'leave') {
      setHoverPos(null);
    } else {
      setHoverPos({x, y});
    }

    if (type === 'down') {
      setHighlightedTiles([]);
      
      if (isPasting && clipboard) {
        // Paste clipboard
        updateRooms(prev => {
          let nextRooms = { ...prev };
          const room = nextRooms[currentRoomId];
          const newTiles = room.tiles.map(row => [...row]);
          
          clipboard.forEach((row, cy) => {
            row.forEach((tileId, cx) => {
              const targetY = y + cy;
              const targetX = x + cx;
              if (targetY >= 0 && targetY < room.height && targetX >= 0 && targetX < room.width) {
                if (tileId === 'P') {
                  for (const rId in nextRooms) {
                    const r = nextRooms[rId];
                    let changed = false;
                    const newRTiles = r.tiles.map(rRow => [...rRow]);
                    for (let ry = 0; ry < newRTiles.length; ry++) {
                      for (let rx = 0; rx < newRTiles[ry].length; rx++) {
                        if (newRTiles[ry][rx] === 'P') {
                          newRTiles[ry][rx] = 'F';
                          changed = true;
                        }
                      }
                    }
                    if (changed) {
                      nextRooms[rId] = { ...r, tiles: newRTiles };
                    }
                  }
                }
                newTiles[targetY][targetX] = tileId;
              }
            });
          });
          
          return { ...nextRooms, [currentRoomId]: { ...(nextRooms[currentRoomId] || room), tiles: newTiles } };
        });
        setIsPasting(false);
        return;
      }

      if (roomEditMode === 'select') {
        setSelectionStart({x, y});
        setSelectionEnd({x, y});
        setIsPainting(true);
      } else {
        setIsPainting(true);
        paintTile(x, y, e.buttons === 2 || e.button === 2);
      }
    } else if (type === 'move') {
      if (isPainting) {
        if (roomEditMode === 'select') {
          setSelectionEnd({x, y});
        } else {
          paintTile(x, y, e.buttons === 2 || e.button === 2);
        }
      }
    } else if (type === 'up' || type === 'leave') {
      setIsPainting(false);
    }
  };

  const paintTile = (x: number, y: number, isErase: boolean) => {
    const tileToPaint = isErase ? 'F' : selectedTileId;

    if (x >= 0 && x < currentRoom.width && y >= 0 && y < currentRoom.height) {
      updateRooms(prev => {
        const room = prev[currentRoomId];
        if (room.tiles[y][x] === tileToPaint) return prev;
        
        let nextRooms = { ...prev };
        
        // Enforce max 1 player in the entire game
        if (tileToPaint === 'P') {
          for (const rId in nextRooms) {
            const r = nextRooms[rId];
            let changed = false;
            const newRTiles = r.tiles.map(row => [...row]);
            for (let ry = 0; ry < newRTiles.length; ry++) {
              for (let rx = 0; rx < newRTiles[ry].length; rx++) {
                if (newRTiles[ry][rx] === 'P') {
                  newRTiles[ry][rx] = 'F';
                  changed = true;
                }
              }
            }
            if (changed) {
              nextRooms[rId] = { ...r, tiles: newRTiles };
            }
          }
        }
        
        const currentRoomUpdated = nextRooms[currentRoomId] || room;
        const newTiles = currentRoomUpdated.tiles.map(row => [...row]);
        newTiles[y][x] = tileToPaint;
        
        return { ...nextRooms, [currentRoomId]: { ...currentRoomUpdated, tiles: newTiles } };
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== 'rooms') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = currentRoom.width * 32;
    canvas.height = currentRoom.height * 32;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawSprite = (spriteId: string, x: number, y: number, customW?: number, customH?: number) => {
      const sprite = sprites[spriteId];
      if (!sprite) return;
      const w = customW !== undefined ? customW * 32 : sprite.width * 32;
      const h = customH !== undefined ? customH * 32 : sprite.height * 32;
      
      const urlToDraw = sprite.dataUrls ? sprite.dataUrls[0] : undefined;
      if (urlToDraw) {
        let img = imageCache[urlToDraw];
        if (!img) {
          img = new Image();
          img.src = urlToDraw;
          imageCache[urlToDraw] = img;
        }
        if (img instanceof HTMLImageElement && img.complete) {
          ctx.drawImage(img, x * 32, y * 32, w, h);
        } else if (img instanceof HTMLImageElement) {
          img.onload = () => {
            ctx.drawImage(img as HTMLImageElement, x * 32, y * 32, w, h);
          };
        } else {
          ctx.drawImage(img, x * 32, y * 32, w, h);
        }
        return;
      }
      
      const frame = sprite.frames[0];
      if (!frame || !frame[0]) return;
      const cacheKey = `${spriteId}_0_${w}_${h}`;
      
      if (!imageCache[cacheKey]) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const tCtx = offCanvas.getContext('2d');
        if (tCtx) {
          const pixelSizeX = w / frame[0].length;
          const pixelSizeY = h / frame.length;
          frame.forEach((row, ry) => {
            row.forEach((color, rx) => {
              if (color !== 'transparent') {
                tCtx.fillStyle = color;
                tCtx.fillRect(rx * pixelSizeX, ry * pixelSizeY, pixelSizeX + 0.5, pixelSizeY + 0.5);
              }
            });
          });
        }
        imageCache[cacheKey] = offCanvas;
      }
      ctx.drawImage(imageCache[cacheKey], x * 32, y * 32, w, h);
    };

    if (currentRoom.backgroundTileId && tiles[currentRoom.backgroundTileId]) {
      const bgTile = tiles[currentRoom.backgroundTileId];
      drawSprite(bgTile.spriteId, 0, 0, currentRoom.width, currentRoom.height);
    }

    currentRoom.tiles.forEach((row, y) => {
      row.forEach((tileId, x) => {
        const tile = tiles[tileId];
        if (tile) drawSprite(tile.spriteId, x, y);
      });
    });
    
    currentRoom.entities.forEach(entity => {
      drawSprite(entity.spriteId, entity.x, entity.y);
    });

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    for (let i = 0; i <= currentRoom.width; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, currentRoom.height * 32);
      ctx.stroke();
    }
    for (let i = 0; i <= currentRoom.height; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(currentRoom.width * 32, i * 32);
      ctx.stroke();
    }

    if (selectionStart && selectionEnd) {
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);
      
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.fillRect(minX * 32, minY * 32, (maxX - minX + 1) * 32, (maxY - minY + 1) * 32);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX * 32, minY * 32, (maxX - minX + 1) * 32, (maxY - minY + 1) * 32);
    }

    if (isPasting && clipboard && hoverPos) {
      ctx.globalAlpha = 0.5;
      clipboard.forEach((row, y) => {
        row.forEach((tileId, x) => {
          const tile = tiles[tileId];
          if (tile) drawSprite(tile.spriteId, hoverPos.x + x, hoverPos.y + y);
        });
      });
      ctx.globalAlpha = 1.0;
    }

    if (highlightedTiles.length > 0) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.4)'; // Yellow highlight
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
      ctx.lineWidth = 2;
      highlightedTiles.forEach(({x, y}) => {
        ctx.fillRect(x * 32, y * 32, 32, 32);
        ctx.strokeRect(x * 32, y * 32, 32, 32);
      });
    }

  }, [currentRoom, tiles, sprites, activeTab, selectionStart, selectionEnd, isPasting, clipboard, hoverPos, highlightedTiles]);

  const handleSpriteUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const url = event.target?.result as string;
        const newSpriteId = `sprite_${Date.now()}`;
        setSprites(prev => ({
          ...prev,
          [newSpriteId]: {
            id: newSpriteId,
            name: `Imported Sprite`,
            dataUrls: [url],
            width: Math.max(0.1, img.width / 32),
            height: Math.max(0.1, img.height / 32),
            frames: [[[]]], // Empty frame since we use dataUrls
            frameRate: 1
          }
        }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const SpritePreview = ({ spriteId, frameIndex = 0 }: { spriteId: string, frameIndex?: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const sprite = sprites[spriteId];
      if (!sprite) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const urlToDraw = sprite.dataUrls ? sprite.dataUrls[frameIndex] : undefined;
      if (urlToDraw) {
        let img = imageCache[urlToDraw];
        if (!img) {
          img = new Image();
          img.src = urlToDraw;
          imageCache[urlToDraw] = img;
        }
        if (img instanceof HTMLImageElement && img.complete) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else if (img instanceof HTMLImageElement) {
          img.onload = () => {
            ctx.drawImage(img as HTMLImageElement, 0, 0, canvas.width, canvas.height);
          };
        } else {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        return;
      }

      const frame = sprite.frames[frameIndex] || sprite.frames[0];
      if (!frame || !frame[0]) return;
      const pixelWidth = canvas.width / frame[0].length;
      const pixelHeight = canvas.height / frame.length;
      frame.forEach((row, ry) => {
        row.forEach((color, rx) => {
          if (color !== 'transparent') {
            ctx.fillStyle = color;
            ctx.fillRect(rx * pixelWidth, ry * pixelHeight, pixelWidth, pixelHeight);
          }
        });
      });
    }, [spriteId, sprites, frameIndex]);
    const sprite = sprites[spriteId];
    const w = sprite ? sprite.width * 32 : 32;
    const h = sprite ? sprite.height * 32 : 32;
    return <canvas ref={canvasRef} width={w} height={h} style={{ width: 32, height: 32, objectFit: 'contain' }} className="image-pixelated bg-neutral-900 rounded" />;
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans pt-16">
      {/* Sidebar */}
      <div className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex gap-2">
          <button onClick={() => setActiveTab('rooms')} className={`flex-1 py-2 rounded flex justify-center ${activeTab === 'rooms' ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}><MapIcon size={18} /></button>
          <button onClick={() => setActiveTab('tiles')} className={`flex-1 py-2 rounded flex justify-center ${activeTab === 'tiles' ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}><LayoutGrid size={18} /></button>
          <button onClick={() => setActiveTab('sprites')} className={`flex-1 py-2 rounded flex justify-center ${activeTab === 'sprites' ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}><ImageIcon size={18} /></button>
        </div>

        <div className="px-4 py-3 border-b border-neutral-800 flex flex-col gap-2">
          <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Project Data</div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                const dataStr = JSON.stringify({ rooms, tiles, sprites });
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                const exportFileDefaultName = 'project_data.json';
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
              }}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 p-2 text-xs rounded text-center transition-colors"
            >
              Export JSON
            </button>
            <label className="flex-1 bg-neutral-800 hover:bg-neutral-700 p-2 text-xs rounded text-center cursor-pointer transition-colors">
              Import 
              <input type="file" accept=".json,.csv" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const content = event.target?.result as string;
                    if (file.name.endsWith('.csv')) {
                      if (content.startsWith('map,tile name,sprite')) {
                        const { newRooms, newTiles, newSprites, newRoomId } = importAllRoomsCSV(content, rooms, tiles, sprites);
                        setRooms(newRooms);
                        setTiles(newTiles);
                        setSprites(newSprites);
                        setCurrentRoomId(newRoomId);
                        alert('CSV Imported successfully!');
                      } else {
                        // Support old 2D array format as fallback
                        const rows = content.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
                        updateRooms(prev => {
                          const newRooms = { ...prev };
                          const width = Math.max(...rows.map(r => r.length), 1);
                          const height = Math.max(rows.length, 1);
                          // Pad rows
                          const paddedRows = Array(height).fill(0).map((_, y) => {
                            return Array(width).fill('F').map((_, x) => rows[y]?.[x] || 'F');
                          });
                          newRooms[currentRoomId] = { ...newRooms[currentRoomId], width, height, tiles: paddedRows };
                          return newRooms;
                        });
                        alert('Simple Map CSV Imported successfully!');
                      }
                    } else {
                      const data = JSON.parse(content);
                      if (data.rooms) setRooms(data.rooms);
                      if (data.tiles) setTiles(data.tiles);
                      if (data.sprites) setSprites(data.sprites);
                      alert('JSON Imported successfully!');
                    }
                  } catch (err) {
                    alert('Import Error: Invalid file format or data.');
                    console.error('Import failed', err);
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }} />
            </label>
          </div>
          <button 
              onClick={() => {
                const csvContent = exportAllRoomsCSV(rooms, tiles, sprites);
                const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', `all_maps_tiles.csv`);
                linkElement.click();
              }}
              className="w-full bg-neutral-800 hover:bg-neutral-700 p-2 text-xs rounded text-center transition-colors"
            >
              Export Project Maps (CSV)
            </button>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rooms, tiles, sprites })
                  });
                  if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error('Failed to export: ' + errorText);
                  }
                  
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'my_game.zip';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                } catch (e) {
                  console.error(e);
                  alert((e as Error).message);
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 p-2 text-xs rounded text-center transition-colors font-bold text-white shadow-lg"
            >
              Export Playable Game (ZIP)
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'rooms' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Edit Mode</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setRoomEditMode('paint')}
                    className={`flex-1 p-2 rounded text-sm ${roomEditMode === 'paint' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                  >
                    Paint
                  </button>
                  <button 
                    onClick={() => setRoomEditMode('select')}
                    className={`flex-1 p-2 rounded text-sm ${roomEditMode === 'select' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                  >
                    Select
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Select Room</label>
                <div className="flex gap-2">
                  <select 
                    value={currentRoomId} 
                    onChange={e => setCurrentRoomId(e.target.value)}
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                  >
                    {Object.keys(rooms).map(id => <option key={id} value={id}>{rooms[id].name}</option>)}
                  </select>
                  <button 
                    onClick={() => {
                      const newId = `room_${Date.now()}`;
                      updateRooms(prev => ({
                        ...prev,
                        [newId]: {
                          id: newId,
                          name: `New Room`,
                          width: 10,
                          height: 10,
                          tiles: Array(10).fill(0).map(() => Array(10).fill('F')),
                          entities: []
                        }
                      }));
                      setCurrentRoomId(newId);
                    }}
                    className="p-2 bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700"
                    title="Add Room"
                  >
                    <Plus size={16} />
                  </button>
                  {Object.keys(rooms).length > 1 && (
                    <button 
                      onClick={() => {
                        updateRooms(prev => {
                          const newRooms = { ...prev };
                          delete newRooms[currentRoomId];
                          setCurrentRoomId(Object.keys(newRooms)[0]);
                          return newRooms;
                        });
                      }}
                      className="p-2 bg-red-900/30 text-red-500 border border-red-900/50 rounded hover:bg-red-900/50"
                      title="Delete Room"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Width</label>
                  <input type="number" value={currentRoom.width} onChange={e => handleRoomResize(parseInt(e.target.value) || 1, currentRoom.height)} className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Height</label>
                  <input type="number" value={currentRoom.height} onChange={e => handleRoomResize(currentRoom.width, parseInt(e.target.value) || 1)} className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Background Tile</label>
                  <select 
                    value={currentRoom.backgroundTileId || ''}
                    onChange={e => updateRooms(prev => ({ ...prev, [currentRoomId]: { ...prev[currentRoomId], backgroundTileId: e.target.value || undefined } }))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                  >
                    <option value="">None</option>
                    {Object.values(tiles).filter(t => t.category === 'background').map(t => (
                      <option key={t.id} value={t.id}>{t.name || t.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Tile Palette</label>
                {['character', 'tile', 'item', 'background'].map(category => {
                  const categoryTiles = Object.values(tiles).filter(t => (t.category || 'tile') === category);
                  if (categoryTiles.length === 0) return null;
                  return (
                    <div key={category} className="mb-4">
                      <div className="text-[10px] text-neutral-600 uppercase tracking-widest mb-2">{category}s</div>
                      <div className="grid grid-cols-4 gap-2">
                        {categoryTiles.map(tile => (
                          <div key={tile.id} className="flex flex-col items-center gap-1">
                            <button 
                              onClick={() => setSelectedTileId(tile.id)}
                              className={`p-1 rounded border-2 ${selectedTileId === tile.id ? 'border-blue-500' : 'border-transparent hover:border-neutral-700'}`}
                              title={tile.name || sprites[tile.spriteId]?.name || tile.id}
                            >
                              <SpritePreview spriteId={tile.spriteId} />
                            </button>
                            <input 
                              value={tile.name || sprites[tile.spriteId]?.name || tile.id}
                              onChange={(e) => setTiles(prev => ({...prev, [tile.id]: {...tile, name: e.target.value}}))}
                              className="text-[9px] text-neutral-500 truncate w-full text-center bg-transparent outline-none hover:bg-neutral-800 focus:bg-neutral-800 rounded px-1" 
                              title={tile.name || sprites[tile.spriteId]?.name || tile.id}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'sprites' && (
            <div className="space-y-4">
              <label className="flex items-center justify-center gap-2 w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded p-3 cursor-pointer transition-colors">
                <Upload size={16} />
                <span className="text-sm">Upload Sprite (PNG)</span>
                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleSpriteUpload} />
              </label>
              
              <div className="space-y-2">
                {Object.values(sprites).map(sprite => (
                  <div 
                    key={sprite.id} 
                    onClick={() => setSelectedSpriteId(sprite.id)}
                    className={`flex items-center gap-3 p-2 rounded border cursor-pointer ${selectedSpriteId === sprite.id ? 'bg-blue-900/30 border-blue-500' : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'}`}
                  >
                    <SpritePreview spriteId={sprite.id} />
                    <div className="flex-1 overflow-hidden">
                      <div className="text-sm truncate">{sprite.name}</div>
                      <div className="text-xs text-neutral-500">{sprite.frames.length} frames</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tiles' && (
            <div className="space-y-4">
              <button 
                onClick={() => {
                  const newId = `T${Date.now()}`;
                  const newSpriteId = `sprite_${newId}`;
                  
                  setSprites(prev => ({
                    ...prev,
                    [newSpriteId]: {
                      id: newSpriteId,
                      name: `Sprite ${newId}`,
                      width: 1,
                      height: 1,
                      frameRate: 1,
                      frames: [[[['#ff00ff']]]]
                    }
                  }));

                  setTiles(prev => ({...prev, [newId]: { id: newId, spriteId: newSpriteId, isSolid: false, category: 'tile' }}));
                  setSelectedTileId(newId);
                }}
                className="flex items-center justify-center gap-2 w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded p-3 transition-colors"
              >
                <Plus size={16} />
                <span className="text-sm">New Tile</span>
              </button>

              <div className="space-y-4">
                {['character', 'tile', 'item', 'background'].map(category => {
                  const categoryTiles = Object.values(tiles).filter(t => (t.category || 'tile') === category && t.id !== 'F');
                  if (categoryTiles.length === 0) return null;
                  return (
                    <div key={category}>
                      <div className="text-[10px] text-neutral-600 uppercase tracking-widest mb-2">{category}s</div>
                      <div className="space-y-2">
                        {categoryTiles.map(tile => (
                          <div 
                            key={tile.id} 
                            onClick={() => setSelectedTileId(tile.id)}
                            className={`flex items-center gap-3 p-2 rounded border cursor-pointer ${selectedTileId === tile.id ? 'bg-blue-900/30 border-blue-500' : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'}`}
                          >
                            <SpritePreview spriteId={tile.spriteId} />
                            <div className="flex-1">
                              <input 
                                value={tile.name || sprites[tile.spriteId]?.name || tile.id}
                                onChange={(e) => setTiles(prev => ({...prev, [tile.id]: {...tile, name: e.target.value}}))}
                                onClick={(e) => e.stopPropagation()} // Prevent selecting tile when clicking input
                                className="text-sm font-mono bg-transparent outline-none w-full border-b border-transparent focus:border-blue-500" 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-neutral-950 overflow-auto">
        <div className="p-8 min-w-max min-h-max flex flex-col items-start justify-start">
          {activeTab === 'rooms' ? (
            <div className="bg-neutral-900 p-2 rounded-xl shadow-2xl border border-neutral-800 shrink-0">
              <canvas
              ref={canvasRef}
              onMouseDown={(e) => handleCanvasInteraction(e, 'down')}
              onMouseUp={(e) => handleCanvasInteraction(e, 'up')}
              onMouseLeave={(e) => handleCanvasInteraction(e, 'leave')}
              onMouseMove={(e) => handleCanvasInteraction(e, 'move')}
              onContextMenu={(e) => e.preventDefault()}
              className="image-pixelated cursor-crosshair"
              style={{ width: currentRoom.width * 32, height: currentRoom.height * 32 }}
            />
          </div>
        ) : activeTab === 'sprites' && selectedSpriteId && sprites[selectedSpriteId] ? (
          <div className="bg-neutral-900 p-6 rounded-xl shadow-2xl border border-neutral-800 w-full max-w-2xl space-y-6">
            <h2 className="text-xl font-bold">Edit Sprite</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Name</label>
                <input 
                  type="text" 
                  value={sprites[selectedSpriteId].name} 
                  onChange={e => setSprites(prev => ({...prev, [selectedSpriteId]: {...prev[selectedSpriteId], name: e.target.value}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Frame Rate (FPS)</label>
                <select 
                  value={sprites[selectedSpriteId].frameRate}
                  onChange={e => setSprites(prev => ({...prev, [selectedSpriteId]: {...prev[selectedSpriteId], frameRate: parseInt(e.target.value)}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                >
                  {[1, 2, 3, 4, 6, 8, 12, 24].map(fps => <option key={fps} value={fps}>{fps} FPS</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Width (Tiles)</label>
                <input 
                  type="number" 
                  min="0.1"
                  step="0.1"
                  value={sprites[selectedSpriteId].width} 
                  onChange={e => setSprites(prev => ({...prev, [selectedSpriteId]: {...prev[selectedSpriteId], width: parseFloat(e.target.value) || 1}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Height (Tiles)</label>
                <input 
                  type="number" 
                  min="0.1"
                  step="0.1"
                  value={sprites[selectedSpriteId].height} 
                  onChange={e => setSprites(prev => ({...prev, [selectedSpriteId]: {...prev[selectedSpriteId], height: parseFloat(e.target.value) || 1}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm" 
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Frames</label>
              <div className="flex flex-wrap gap-2">
                {sprites[selectedSpriteId].frames.map((_, i) => (
                  <div key={i} className="relative group">
                    <SpritePreview spriteId={selectedSpriteId} frameIndex={i} />
                    <div className="absolute top-0 right-0 bg-black/50 text-xs px-1 rounded-bl">{i}</div>
                    {sprites[selectedSpriteId].frames.length > 1 && (
                      <button 
                        onClick={() => setSprites(prev => {
                          const newFrames = [...prev[selectedSpriteId].frames];
                          newFrames.splice(i, 1);
                          const newDataUrls = prev[selectedSpriteId].dataUrls ? [...prev[selectedSpriteId].dataUrls!] : undefined;
                          if (newDataUrls) newDataUrls.splice(i, 1);
                          return {...prev, [selectedSpriteId]: {...prev[selectedSpriteId], frames: newFrames, dataUrls: newDataUrls}};
                        })}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <label className="flex items-center justify-center w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded cursor-pointer transition-colors">
                  <Plus size={24} className="text-neutral-500" />
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const url = event.target?.result as string;
                        setSprites(prev => {
                          const sprite = prev[selectedSpriteId];
                          return {
                            ...prev,
                            [selectedSpriteId]: {
                              ...sprite,
                              dataUrls: [...(sprite.dataUrls || Array(sprite.frames.length).fill('')), url],
                              frames: [...sprite.frames, [[]]]
                            }
                          };
                        });
                      };
                      reader.readAsDataURL(file);
                      e.target.value = ''; // Reset input to allow uploading same file
                    }} 
                  />
                </label>
              </div>
            </div>
          </div>
        ) : activeTab === 'tiles' && selectedTileId && tiles[selectedTileId] ? (
          <div className="bg-neutral-900 p-6 rounded-xl shadow-2xl border border-neutral-800 w-full max-w-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Edit Tile {tiles[selectedTileId].name || sprites[tiles[selectedTileId].spriteId]?.name ? `(${tiles[selectedTileId].name || sprites[tiles[selectedTileId].spriteId]?.name})` : ''}</h2>
              {Object.keys(tiles).length > 1 && (
                <button 
                  onClick={() => {
                    const newTiles = { ...tiles };
                    delete newTiles[selectedTileId];
                    setTiles(newTiles);
                    setSelectedTileId(Object.keys(newTiles)[0]);
                  }}
                  className="p-2 bg-red-900/30 text-red-500 border border-red-900/50 rounded hover:bg-red-900/50"
                  title="Delete Tile"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Name</label>
                <input 
                  type="text"
                  value={tiles[selectedTileId].name || sprites[tiles[selectedTileId].spriteId]?.name || ''}
                  onChange={e => setTiles(prev => ({...prev, [selectedTileId]: {...prev[selectedTileId], name: e.target.value}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-white"
                  placeholder="e.g. Wall, Key, Door..."
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Sprite</label>
                <select 
                  value={tiles[selectedTileId].spriteId}
                  onChange={e => setTiles(prev => ({...prev, [selectedTileId]: {...prev[selectedTileId], spriteId: e.target.value}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                >
                  {Object.keys(sprites).map(sId => <option key={sId} value={sId}>{sprites[sId].name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Category</label>
                <select 
                  value={tiles[selectedTileId].category || 'tile'}
                  onChange={e => setTiles(prev => ({...prev, [selectedTileId]: {...prev[selectedTileId], category: e.target.value as any}}))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                >
                  <option value="character">Character</option>
                  <option value="tile">Tile</option>
                  <option value="item">Item</option>
                  <option value="background">Background</option>
                </select>
              </div>
              <div className="flex items-center pt-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={tiles[selectedTileId].isSolid}
                    onChange={e => setTiles(prev => ({...prev, [selectedTileId]: {...prev[selectedTileId], isSolid: e.target.checked}}))}
                    className="w-4 h-4 accent-blue-500"
                  />
                  Solid Collision
                </label>
              </div>
            </div>
            
            <div className="border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs text-neutral-500 uppercase tracking-wider">Triggers</label>
                <select 
                  value={tiles[selectedTileId].trigger?.type || ''}
                  onChange={e => {
                    const type = e.target.value as any;
                    if (!type) {
                      setTiles(prev => {
                        const newTiles = {...prev};
                        delete newTiles[selectedTileId].trigger;
                        return newTiles;
                      });
                    } else {
                      setTiles(prev => ({...prev, [selectedTileId]: {...prev[selectedTileId], trigger: { type, events: [] }}}));
                    }
                  }}
                  className="bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                >
                  <option value="">No Trigger</option>
                  <option value="collision">On Collision</option>
                  <option value="enter">On Enter</option>
                  <option value="interact">On Interact</option>
                </select>
              </div>
              
              {tiles[selectedTileId].trigger && (
                <div className="space-y-4">
                  {tiles[selectedTileId].trigger!.events.map((event, eventIdx) => (
                    <div key={eventIdx} className="bg-neutral-950 p-4 rounded border border-neutral-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-neutral-400">Event {eventIdx + 1}</h4>
                        <button 
                          onClick={() => setTiles(prev => {
                            const newEvents = [...prev[selectedTileId].trigger!.events];
                            newEvents.splice(eventIdx, 1);
                            return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                          })}
                          className="text-red-500 hover:text-red-400 text-xs"
                        >
                          Remove Event
                        </button>
                      </div>
                      
                      {/* Condition */}
                      <div>
                        <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">Condition</label>
                        <div className="flex gap-2">
                          <select 
                            value={event.condition ? 'item' : 'none'}
                            onChange={e => {
                              const val = e.target.value;
                              setTiles(prev => {
                                const newEvents = [...prev[selectedTileId].trigger!.events];
                                if (val === 'none') newEvents[eventIdx].condition = null;
                                else newEvents[eventIdx].condition = { itemId: 'key', requiredCount: 1 };
                                return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                              });
                            }}
                            className="bg-neutral-800 border border-neutral-700 rounded p-2 text-sm"
                          >
                            <option value="none">Always (No Condition)</option>
                            <option value="item">Requires Item</option>
                          </select>
                          
                          {event.condition && (
                            <>
                              <input 
                                type="text" 
                                placeholder="Item ID"
                                value={event.condition.itemId}
                                onChange={e => setTiles(prev => {
                                  const newEvents = [...prev[selectedTileId].trigger!.events];
                                  newEvents[eventIdx].condition!.itemId = e.target.value;
                                  return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                })}
                                className="bg-neutral-800 border border-neutral-700 rounded p-2 text-sm w-24"
                              />
                              <input 
                                type="number" 
                                min="1"
                                placeholder="Count"
                                value={event.condition.requiredCount}
                                onChange={e => setTiles(prev => {
                                  const newEvents = [...prev[selectedTileId].trigger!.events];
                                  newEvents[eventIdx].condition!.requiredCount = parseInt(e.target.value) || 1;
                                  return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                })}
                                className="bg-neutral-800 border border-neutral-700 rounded p-2 text-sm w-20"
                              />
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div>
                        <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Actions</label>
                        <div className="space-y-2">
                          {event.actions.map((action, actionIdx) => (
                            <div 
                              key={actionIdx} 
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', `${eventIdx},${actionIdx}`);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const data = e.dataTransfer.getData('text/plain');
                                if (!data) return;
                                const [dragEventIdxStr, dragActionIdxStr] = data.split(',');
                                const dragEventIdx = parseInt(dragEventIdxStr);
                                const dragActionIdx = parseInt(dragActionIdxStr);
                                
                                if (dragEventIdx !== eventIdx || dragActionIdx === actionIdx) return;
                                
                                setTiles(prev => {
                                  if (!prev[selectedTileId] || !prev[selectedTileId].trigger) return prev;
                                  const newEvents = prev[selectedTileId].trigger.events.map(ev => ({
                                     ...ev,
                                     actions: [...ev.actions]
                                  }));
                                  
                                  const actions = newEvents[eventIdx].actions;
                                  const [draggedAction] = actions.splice(dragActionIdx, 1);
                                  actions.splice(actionIdx, 0, draggedAction);
                                  
                                  return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                });
                              }}
                              className="flex items-center gap-2 bg-neutral-900 p-2 rounded border border-neutral-800 transition-colors hover:bg-neutral-800"
                            >
                              <div className="cursor-move text-neutral-500 hover:text-white" title="Drag to reorder">
                                <GripVertical size={14} />
                              </div>
                              <select 
                                value={action.type}
                                onChange={e => {
                                  const type = e.target.value as any;
                                  let payload: any = {};
                                  if (type === 'dialogue') payload = { text: ['New dialogue'] };
                                  if (type === 'teleport') payload = { roomId: 'room1', x: 0, y: 0 };
                                  if (type === 'giveItem' || type === 'consumeItem') payload = { itemId: 'key', count: 1 };
                                  
                                  setTiles(prev => {
                                    const newEvents = [...prev[selectedTileId].trigger!.events];
                                    newEvents[eventIdx].actions[actionIdx] = { type, payload } as any;
                                    return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                  });
                                }}
                                className="bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                              >
                                <option value="dialogue">Dialogue</option>
                                <option value="teleport">Teleport</option>
                                <option value="giveItem">Give Item</option>
                                <option value="consumeItem">Consume Item</option>
                              </select>
                              
                              <div className="flex-1 flex gap-2">
                                {action.type === 'dialogue' && (
                                  <input 
                                    type="text" 
                                    value={action.payload.text.join('|')}
                                    onChange={e => {
                                      const text = e.target.value.split('|');
                                      setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).text = text;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      });
                                    }}
                                    placeholder="Line 1|Line 2"
                                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                  />
                                )}
                                {action.type === 'teleport' && (
                                  <>
                                    <input 
                                      type="text" 
                                      value={action.payload.roomId}
                                      onChange={e => setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).roomId = e.target.value;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      })}
                                      placeholder="Room ID"
                                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                    />
                                    <input 
                                      type="number" 
                                      value={action.payload.x}
                                      onChange={e => setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).x = parseInt(e.target.value) || 0;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      })}
                                      placeholder="X"
                                      className="w-12 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                    />
                                    <input 
                                      type="number" 
                                      value={action.payload.y}
                                      onChange={e => setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).y = parseInt(e.target.value) || 0;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      })}
                                      placeholder="Y"
                                      className="w-12 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                    />
                                  </>
                                )}
                                {(action.type === 'giveItem' || action.type === 'consumeItem') && (
                                  <>
                                    <input 
                                      type="text" 
                                      value={action.payload.itemId}
                                      onChange={e => setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).itemId = e.target.value;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      })}
                                      placeholder="Item ID"
                                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                    />
                                    <input 
                                      type="number" 
                                      value={action.payload.count}
                                      onChange={e => setTiles(prev => {
                                        const newEvents = [...prev[selectedTileId].trigger!.events];
                                        (newEvents[eventIdx].actions[actionIdx].payload as any).count = parseInt(e.target.value) || 1;
                                        return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                      })}
                                      placeholder="Count"
                                      className="w-16 bg-neutral-800 border border-neutral-700 rounded p-1 text-xs"
                                    />
                                  </>
                                )}
                              </div>
                              
                              <button 
                                onClick={() => setTiles(prev => {
                                  const newEvents = [...prev[selectedTileId].trigger!.events];
                                  newEvents[eventIdx].actions.splice(actionIdx, 1);
                                  return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                                })}
                                className="text-red-500 hover:text-red-400"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          
                          <button 
                            onClick={() => setTiles(prev => {
                              const newEvents = [...prev[selectedTileId].trigger!.events];
                              newEvents[eventIdx] = {
                                ...newEvents[eventIdx],
                                actions: [...newEvents[eventIdx].actions, { type: 'dialogue', payload: { text: ['New dialogue'] } }]
                              };
                              return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                            })}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
                          >
                            <Plus size={12} /> Add Action
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setTiles(prev => {
                      const newEvents = [...(prev[selectedTileId].trigger?.events || [])];
                      newEvents.push({ condition: null, actions: [{ type: 'dialogue', payload: { text: ['New dialogue'] } }] });
                      return {...prev, [selectedTileId]: {...prev[selectedTileId], trigger: {...prev[selectedTileId].trigger!, events: newEvents}}};
                    })}
                    className="flex items-center justify-center gap-2 w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded p-2 transition-colors text-sm"
                  >
                    <Plus size={14} /> Add Event
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-neutral-500 text-sm">
            Select an item from the sidebar to edit.
          </div>
        )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .image-pixelated {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}} />
    </div>
  );
}
