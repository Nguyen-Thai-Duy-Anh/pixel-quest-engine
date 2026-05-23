
import React, { useState } from 'react';
import Game from './Game';
import Editor from './Editor';
import { ROOMS, TILES, SPRITES } from './constants';
import { Edit3, Play } from 'lucide-react';

export default function App() {
  const isExport = !!window.__EXPORT_DATA__;
  const [mode, setMode] = useState<'play' | 'edit'>(isExport ? 'play' : 'edit');
  const [rooms, setRooms] = useState(isExport ? window.__EXPORT_DATA__!.rooms : ROOMS);
  const [tiles, setTiles] = useState(isExport ? window.__EXPORT_DATA__!.tiles : TILES);
  const [sprites, setSprites] = useState(isExport ? window.__EXPORT_DATA__!.sprites : SPRITES);

  if (isExport) {
    return (
      <div className="relative min-h-screen bg-black">
        <Game rooms={rooms} tiles={tiles} sprites={sprites} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-neutral-950">
      <div className="absolute top-4 right-4 z-50 flex gap-2 bg-neutral-900 p-1 rounded-lg border border-neutral-800 shadow-xl">
        <button
          onClick={() => setMode('play')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'play' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
        >
          <Play size={16} /> Play
        </button>
        <button
          onClick={() => setMode('edit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'edit' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
        >
          <Edit3 size={16} /> Edit
        </button>
      </div>

      {mode === 'play' ? (
        <Game rooms={rooms} tiles={tiles} sprites={sprites} />
      ) : (
        <Editor rooms={rooms} setRooms={setRooms} tiles={tiles} setTiles={setTiles} sprites={sprites} setSprites={setSprites} />
      )}
    </div>
  );
}
