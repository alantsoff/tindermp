'use client';

import imageCompression from 'browser-image-compression';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { matchApi } from '../_lib/api';
import { resolveMediaUrl } from '../_lib/media';

type PhotoItem = { id: string; url: string; order: number };

function SortablePhoto({
  item,
  onDelete,
}: {
  item: PhotoItem;
  onDelete: (photoId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="ios-interactive relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[rgb(var(--hairline))] bg-[rgb(var(--ios-bg-elevated))]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveMediaUrl(item.url)}
        alt="Фото профиля"
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md active:scale-[0.9]"
        onClick={() => void onDelete(item.id)}
        aria-label="Удалить фото"
        style={{
          transitionDuration: 'var(--dur-base)',
          transitionTimingFunction: 'var(--ease-ios)',
          transitionProperty: 'transform, background-color, opacity',
        }}
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="absolute bottom-1.5 right-1.5 flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
      >
        <GripVertical size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export function PhotoGallery({
  photos,
  editable = false,
  defaultPhotoUrl = null,
}: {
  photos: PhotoItem[];
  editable?: boolean;
  defaultPhotoUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor));
  const items = photos;

  const syncFromServer = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['match', 'me'] }),
      qc.invalidateQueries({ queryKey: ['match', 'feed'] }),
    ]);
  };

  const onUpload = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1.8,
        maxWidthOrHeight: 1080,
        useWebWorker: true,
        fileType: 'image/webp',
      });
      const uploaded = await matchApi.uploadPhoto(compressed);
      if (!uploaded) return;
      await syncFromServer();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (photoId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await matchApi.deletePhoto(photoId);
      await syncFromServer();
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    try {
      await matchApi.reorderPhotos(reordered.map((item) => item.id));
      await syncFromServer();
    } catch {}
  };

  const hasTelegramPrimary = Boolean(defaultPhotoUrl);

  return (
    <div className="space-y-2">
      <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
        Фото профиля: {items.length}/6
        {hasTelegramPrimary ? ' · главное фото: Telegram' : ''}
        {editable ? ' · перетаскивайте для порядка' : ''}
      </div>
      {hasTelegramPrimary ? (
        <div
          className="relative aspect-square w-[calc((100%-0.5rem*2)/3)] overflow-hidden rounded-2xl ring-1"
          style={{ boxShadow: '0 0 0 1px rgb(var(--ios-tint) / 0.5)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              defaultPhotoUrl ? resolveMediaUrl(defaultPhotoUrl) : undefined
            }
            alt="Основное фото Telegram"
            className="h-full w-full object-cover"
          />
          <div
            className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md"
            style={{ background: 'rgb(var(--ios-tint) / 0.7)' }}
          >
            Telegram
          </div>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <SortablePhoto key={item.id} item={item} onDelete={onDelete} />
            ))}
            {editable && items.length < 6 ? (
              <button
                type="button"
                className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--hairline-strong))] bg-[rgb(var(--ios-bg-elevated)/0.5)] text-[rgb(var(--ios-label-secondary)/0.7)] transition active:scale-[0.97] disabled:opacity-50"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                aria-label="Добавить фото"
              >
                <Plus size={22} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          void onUpload(file);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}

