type Path = string;

type Sticker = {
  label: string;
  path: Path;
};

type Stickers = Sticker[];

type StickerConfig = {
  label: string;
  index: number;
  icon?: string;
  url?: string;
  /** 上一次同步时记录的目录名，用于判断目录是否被改名 */
  dirName?: string;
};

type InternalStickerPack = {
  label: string;
  index: number;
  icon?: string;
  dirPath: string;
  /** 上一次同步时记录的目录名，写回 sticker.json 时一并保留 */
  dirName?: string;
  stickerPaths: Map<string, number | undefined>;
};

type StickerPack = {
  label: string;
  icon?: Path;
  index: number;
  dirPath: Path;
  stickers: Stickers;
};

type StickerPathItem = {
  label: string;
  path: string;
  children?: StickerPathItem[];
};

type StickerStore =
  | {
      status: "success";
      stickerPacks: StickerPack[];
      msg?: never;
    }
  | {
      status: "info" | "failed";
      stickerPacks?: never;
      msg: string;
    };

type TgStickerItem = {
  file_id: string;
  file_unique_id: string;
  is_animated: boolean;
  is_video: boolean;
};

type TgStickerSetResult = {
  title: string;
  name: string;
  sticker_type: string;
  stickers: TgStickerItem[];
};

type TgStickerSetResponse = {
  ok: boolean;
  result: TgStickerSetResult;
  description?: string;
};

type TgFileResponse = {
  ok: boolean;
  result: {
    file_path: string;
  };
};

export type {
  Path,
  Sticker,
  Stickers,
  StickerPack,
  StickerStore,
  StickerPathItem,
  StickerConfig,
  InternalStickerPack,
  TgStickerItem,
  TgStickerSetResult,
  TgStickerSetResponse,
  TgFileResponse,
};
