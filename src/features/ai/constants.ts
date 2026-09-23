export const MODERATION_TIMEOUT_MS = 8_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const TONE_TIMEOUT_MS = 25_000;

// Tope de imágenes que se revisan por intento de publicación (portada + cuerpo): un
// artículo con más no manda un request desmedido, se revisan solo las primeras.
export const MAX_MODERATION_IMAGES = 6;
export const MODERATION_IMAGE_FETCH_TIMEOUT_MS = 5_000;

export const AI_MAX_INPUT_CHARS = 30_000;
export const TONE_MAX_INPUT_CHARS = 15_000;

export const MIN_WORDS_TONE = 10;
export const MIN_WORDS_TITLES = 30;
export const MIN_WORDS_SCORE = 80;
export const MIN_WORDS_SUMMARY = 300;

export const MAX_AI_TAGS = 5;
export const MAX_TAGS_PER_POST = 8;

export const AI_TAG_MIN_LENGTH = 2;
export const AI_TAG_MAX_LENGTH = 30;

export const TITLES_COUNT = 5;
export const OUTLINE_MAX_SECTIONS = 12;
export const OUTLINE_MAX_SUBSECTIONS = 6;

export const REASON_MAX_LENGTH = 300;

export const CHAT_TIMEOUT_MS = 45_000;
export const CHAT_FIRST_CHUNK_TIMEOUT_MS = 15_000;
export const CHAT_MAX_USER_CHARS = 4_000;
export const CHAT_MAX_MESSAGE_CHARS = 8_000;
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_TOTAL_CHARS = 24_000;
export const CHAT_HISTORY_MAX_TURNS = 12;
export const CHAT_HISTORY_MAX_CHARS = 16_000;

// Blocks sent with a chat request. With the article, selection and history caps the worst case (3-byte
// characters) stays under MAX_AI_BODY_BYTES; see the size test in schemas.test.ts.
export const CHAT_MAX_BLOCKS = 250;
export const CHAT_SELECTION_MAX_CHARS = 4_000;
export const CHAT_MAX_BLOCK_TYPE_CHARS = 24;

export const EDIT_MAX_MARKDOWN_CHARS = 12_000;
export const EDIT_LABEL_MAX_CHARS = 120;
export const CHAT_MAX_ACTIONS = 8;
export const CHAT_MAX_STEPS = 8;
export const CHAT_STEP_LABEL_MAX_CHARS = 120;

// Ids of the deterministic steps the server adds; every other step comes from the model's plan.
export const SYSTEM_STEP_IDS = ["read", "analyze", "propose"] as const;
