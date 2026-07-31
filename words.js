// ---------------------------------------------------------------------------
// words.js  —  YOUR CONTENT LIBRARY
// This is the part you own and grow over time. Edit freely.
//
// General word bank, organized into 5 DIFFICULTY LEVELS (1 = easiest to
// draw/guess, 5 = hardest/most abstract). The host picks a level in the lobby
// and the game draws only from that level's list.
//
// - Each level has an English (en) and Spanish (es) list.
// - The game picks the list matching the language chosen in the lobby.
// - en/es do NOT need to be the same length — each language draws from its own.
// - Add or remove words freely. Aim for ~20+ per level so words don't recycle
//   too often in big games (the game never repeats a word until the whole
//   level list has been used once).
// ---------------------------------------------------------------------------

export const WORDS = {
  en: {
    1: [ // easiest — simple, concrete objects a child could draw
      "sun", "cat", "house", "tree", "star", "ball", "fish", "car",
      "hat", "cup", "book", "key", "egg", "apple", "dog", "boat",
      "flower", "moon", "cloud", "heart", "door", "shoe", "bee", "cake",
    ],
    2: [ // easy — common everyday things
      "guitar", "umbrella", "rainbow", "clock", "bicycle", "snowman",
      "balloon", "ladder", "candle", "glasses", "hammer", "kite",
      "mushroom", "pizza", "robot", "rocket", "sandwich", "scissors",
      "socks", "teapot", "turtle", "wagon", "whistle", "anchor",
    ],
    3: [ // medium — recognizable but needs some detail
      "lighthouse", "telescope", "volcano", "windmill", "cactus", "campfire",
      "butterfly", "elephant", "kangaroo", "octopus", "pineapple", "sailboat",
      "treehouse", "waterfall", "igloo", "dragon", "castle", "tractor",
      "helicopter", "dinosaur", "scarecrow", "jellyfish", "seahorse", "hourglass",
    ],
    4: [ // hard — events, phenomena, harder scenes
      "earthquake", "tornado", "avalanche", "fireworks", "lightning", "quicksand",
      "whirlpool", "stampede", "eclipse", "mirage", "glacier", "canyon",
      "tsunami", "aurora", "blizzard", "sandstorm", "shipwreck", "hibernation",
      "migration", "camouflage", "recycling", "gravity", "magnet", "compass",
    ],
    5: [ // hardest — abstract ideas and emotions
      "nostalgia", "echo", "irony", "patience", "freedom", "jealousy",
      "wisdom", "chaos", "infinity", "curiosity", "loyalty", "ambition",
      "boredom", "deadline", "teamwork", "democracy", "philosophy", "momentum",
      "empathy", "willpower", "password", "gossip", "silence", "balance",
    ],
  },
  es: {
    1: [
      "sol", "gato", "casa", "árbol", "estrella", "pelota", "pez", "carro",
      "sombrero", "taza", "libro", "llave", "huevo", "manzana", "perro", "barco",
      "flor", "luna", "nube", "corazón", "puerta", "zapato", "abeja", "pastel",
    ],
    2: [
      "guitarra", "paraguas", "arcoíris", "reloj", "bicicleta", "muñeco de nieve",
      "globo", "escalera", "vela", "lentes", "martillo", "cometa",
      "hongo", "pizza", "robot", "cohete", "sándwich", "tijeras",
      "calcetines", "tetera", "tortuga", "carreta", "silbato", "ancla",
    ],
    3: [
      "faro", "telescopio", "volcán", "molino", "cactus", "fogata",
      "mariposa", "elefante", "canguro", "pulpo", "piña", "velero",
      "casa del árbol", "cascada", "iglú", "dragón", "castillo", "tractor",
      "helicóptero", "dinosaurio", "espantapájaros", "medusa", "caballito de mar", "reloj de arena",
    ],
    4: [
      "terremoto", "tornado", "avalancha", "fuegos artificiales", "relámpago", "arena movediza",
      "remolino", "estampida", "eclipse", "espejismo", "glaciar", "cañón",
      "tsunami", "aurora", "ventisca", "tormenta de arena", "naufragio", "hibernación",
      "migración", "camuflaje", "reciclaje", "gravedad", "imán", "brújula",
    ],
    5: [
      "nostalgia", "eco", "ironía", "paciencia", "libertad", "celos",
      "sabiduría", "caos", "infinito", "curiosidad", "lealtad", "ambición",
      "aburrimiento", "fecha límite", "trabajo en equipo", "democracia", "filosofía", "impulso",
      "empatía", "fuerza de voluntad", "contraseña", "chisme", "silencio", "equilibrio",
    ],
  },
};

export const DIFFICULTY_LABELS = {
  1: "Level 1 · Easiest",
  2: "Level 2 · Easy",
  3: "Level 3 · Medium",
  4: "Level 4 · Hard",
  5: "Level 5 · Hardest",
};

export const DEFAULT_DIFFICULTY = 2;
