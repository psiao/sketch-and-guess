// ---------------------------------------------------------------------------
// words.js  —  YOUR CONTENT LIBRARY
// This is the part you own and grow over time. Edit freely.
//
// - Each pack has an English list (en) and a Spanish list (es).
// - The game picks the list matching the language chosen in the lobby.
// - Add your own packs (firm in-jokes, legal terms, VA-world words, seasonal
//   sets, etc.). Keep en/es the same length is NOT required — each language
//   draws from its own list independently.
// - Keep words drawable. Short phrases are fine.
// ---------------------------------------------------------------------------

export const WORD_PACKS = {
  general: {
    label: "General",
    en: [
      "apple", "guitar", "mountain", "umbrella", "elephant", "rainbow",
      "clock", "sailboat", "campfire", "lighthouse", "sandwich", "rocket",
      "snowman", "butterfly", "bicycle", "cactus", "waterfall", "treehouse",
      "telescope", "volcano", "pineapple", "kangaroo", "windmill", "igloo",
    ],
    es: [
      "manzana", "guitarra", "montaña", "paraguas", "elefante", "arcoíris",
      "reloj", "velero", "fogata", "faro", "sándwich", "cohete",
      "muñeco de nieve", "mariposa", "bicicleta", "cactus", "cascada", "casa del árbol",
      "telescopio", "volcán", "piña", "canguro", "molino", "iglú",
    ],
  },

  office: {
    label: "Office life",
    en: [
      "coffee break", "sticky note", "video call", "deadline", "whiteboard",
      "spreadsheet", "office chair", "stapler", "water cooler", "name tag",
      "conference room", "headset", "keyboard", "monitor", "lunch box",
    ],
    es: [
      "pausa para café", "nota adhesiva", "videollamada", "fecha límite", "pizarra",
      "hoja de cálculo", "silla de oficina", "grapadora", "dispensador de agua", "gafete",
      "sala de juntas", "auriculares", "teclado", "monitor", "lonchera",
    ],
  },

  // ---- Add your own packs below, same shape ----
  // legal: {
  //   label: "Legal",
  //   en: ["gavel", "contract", "courtroom", "witness stand"],
  //   es: ["mazo", "contrato", "sala del tribunal", "estrado"],
  // },
};

// Default pack order used if the host doesn't restrict to specific packs.
export const DEFAULT_PACK_IDS = ["general", "office"];
