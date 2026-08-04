// ---------------------------------------------------------------------------
// words.js  —  YOUR CONTENT LIBRARY (edit freely)
// General word bank in 5 DIFFICULTY LEVELS (1 = easiest to draw/guess,
// 5 = hardest/most abstract). 100 words per level per language.
// The game draws from the chosen level with no repeats until the list is
// exhausted, then resets. en/es are independent lists.
// ---------------------------------------------------------------------------

export const WORDS = {
  en: {
    1: [
      "coffee","pizza","hamburger","sandwich","taco","hotdog","donut","cupcake","popcorn","cookie",
      "apple","banana","egg","cheese","bread","cake","wine","beer","soda","ice cream",
      "mug","plate","fork","spoon","knife","bowl","cup","lamp","candle","clock",
      "mirror","pillow","chair","table","bed","sofa","door","window","key","rug",
      "phone","wallet","glasses","watch","hat","shoe","sock","umbrella","bag","ring",
      "sun","moon","star","tree","flower","cloud","rain","mountain","beach","river",
      "car","bicycle","boat","airplane","bus","truck","train","motorcycle","van","taxi",
      "ball","book","pen","guitar","camera","balloon","gift","flag","heart","kite",
      "dog","cat","bird","fish","horse","cow","duck","rabbit","snake","spider",
      "bottle","jar","basket","plant","pot","pan","brush","comb","soap","towel",
    ],
    2: [
      "laptop","keyboard","computer mouse","monitor","printer","headphones","microphone","speaker","charger","battery",
      "hammer","wrench","screwdriver","drill","saw","ladder","toolbox","paintbrush","nail","screw",
      "toaster","blender","microwave","refrigerator","oven","stove","kettle","teapot","frying pan","cutting board",
      "toothbrush","razor","hairdryer","lipstick","perfume","nail polish","scissors","tweezers","bandage","thermometer",
      "necktie","belt","boot","sneaker","scarf","glove","sunglasses","backpack","purse","jacket",
      "mailbox","streetlight","traffic light","fire hydrant","bench","trash can","bus stop","manhole","street sign","parking meter",
      "wine glass","cocktail","coffee maker","alarm clock","picture frame","vase","candlestick","napkin","spatula","corkscrew",
      "stapler","envelope","clipboard","notebook","calculator","ruler","tape","glue","folder","calendar",
      "suitcase","passport","ticket","map","atlas","binoculars","tent","headlamp","canteen","flashlight",
      "dumbbell","treadmill","yoga mat","jump rope","basketball","soccer ball","tennis racket","baseball bat","whistle","stopwatch",
    ],
    3: [
      "lighthouse","telescope","volcano","windmill","cactus","campfire","butterfly","elephant","kangaroo","octopus",
      "pineapple","sailboat","treehouse","waterfall","igloo","dragon","castle","tractor","helicopter","dinosaur",
      "scarecrow","jellyfish","seahorse","hourglass","submarine","fountain","aquarium","greenhouse","hammock","wheelbarrow",
      "microscope","harmonica","unicycle","trampoline","parachute","chandelier","escalator","peacock","flamingo","pelican",
      "cannon","compass","lantern","anvil","windsock","birdhouse","raft","sled","carousel","ferris wheel",
      "roller coaster","skateboard","surfboard","snowboard","canoe","kayak","tricycle","scooter","wheelchair","stroller",
      "penguin","ostrich","koala","panda","zebra","giraffe","rhino","hippo","camel","llama",
      "beehive","spiderweb","mousetrap","fishing rod","hammock stand","picnic table","gazebo","drawbridge","aqueduct","totem pole",
      "typewriter","record player","jukebox","cash register","vending machine","gumball machine","slot machine","pinwheel","kaleidoscope","periscope",
      "chess board","dartboard","bowling pin","trophy","medal","crown","scepter","hourglass timer","sundial","weather balloon",
    ],
    4: [
      "earthquake","tornado","avalanche","fireworks","lightning","quicksand","whirlpool","stampede","eclipse","mirage",
      "glacier","canyon","tsunami","aurora","blizzard","sandstorm","shipwreck","hibernation","migration","camouflage",
      "recycling","gravity","typhoon","cyclone","hurricane","geyser","stalactite","constellation","meteor","comet",
      "wildfire","drought","riptide","sinkhole","erosion","fossil","magma","waterspout","tightrope","catapult",
      "iceberg","weathervane","rockslide","periscope timer","gears","pulley","seesaw balance","dam","turbine","windfarm",
      "solar panel","satellite dish","radar","lighthouse beam","suspension bridge","skyscraper","pyramid","colosseum","aqueduct arch","observatory",
      "hot air balloon","zeppelin","glider","hang glider","wind turbine","oil rig","lighthouse rock","coral reef","tide pool","waterspout cloud",
      "hibernating bear","molting snake","erupting volcano","cracking ice","falling rocks","rising tide","spinning tornado","crashing wave","spreading fire","melting glacier",
      "constellation map","lunar phase","solar flare","shooting star","northern lights","meteor shower","dust storm","flash flood","mudslide","landslide",
      "quicksilver","magnetism","static shock","echo cave","stalagmite","fault line","tectonic plate","lava flow","ash cloud","crater",
    ],
    5: [
      "love","fear","joy","anger","hope","envy","pride","shame","grief","relief",
      "courage","patience","boredom","panic","calm","stress","worry","surprise","trust","doubt",
      "curiosity","jealousy","loneliness","excitement","gratitude","empathy","nostalgia","confusion","wonder","regret",
      "freedom","justice","peace","war","time","chaos","order","balance","luck","fate",
      "truth","secret","mystery","danger","safety","victory","defeat","power","wealth","poverty",
      "fame","wisdom","knowledge","ignorance","memory","dream","imagination","creativity","logic","reason",
      "teamwork","leadership","friendship","rivalry","competition","cooperation","democracy","unity","conflict","betrayal",
      "loyalty","tradition","celebration","ceremony","protest","revolution","community","growth","decay","change",
      "progress","evolution","energy","momentum","infinity","eternity","silence","harmony","rhythm","echo",
      "idea","belief","promise","warning","invitation","deadline","password","gossip","rumor","ambition",
    ],
  },
};

export const DIFFICULTY_LABELS = {
  1: "Level 1 · Easiest", 2: "Level 2 · Easy", 3: "Level 3 · Medium",
  4: "Level 4 · Hard", 5: "Level 5 · Hardest",
};
export const DEFAULT_DIFFICULTY = 2;
