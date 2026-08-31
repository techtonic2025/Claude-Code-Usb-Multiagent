/* Caffè Nobile — catalogo prodotti e origini (dati condivisi) */

const TONES = {
  brown:   "linear-gradient(140deg,#4a3526,#2c1f14)",
  caramel: "linear-gradient(140deg,#c89b6b,#8a5c33)",
  redbrown:"linear-gradient(140deg,#6b3a2a,#3d2018)",
  green:   "linear-gradient(140deg,#4c6b46,#2c4527)",
  charcoal:"linear-gradient(140deg,#3a322a,#1f1a14)",
  gold:    "linear-gradient(140deg,#b98a4f,#6f4e26)",
};

const PRODUCTS = [
  { id: "etiopia-yirgacheffe", name: "Etiopia Yirgacheffe Grand Cru", cat: "Monorigine", origins: ["Etiopia"], roast: "Medio", price: 24.90, weight: "250g", notes: "Gelsomino, Bergamotto", rating: 4.8, badge: null, tone: "brown", img: "assets/img/p-etiopia.jpg" },
  { id: "brasile-cerrado", name: "Brasile Cerrado Natural Reserve", cat: "Miscela Premium", origins: ["Brasile"], roast: "Medio", price: 18.30, weight: "250g", notes: "Cioccolato, Nocciola", rating: 4.6, badge: null, tone: "caramel", img: "assets/img/p-brasile.jpg" },
  { id: "colombia-huila", name: "Colombia Huila Supremo Geisha", cat: "Monorigine", origins: ["Colombia"], roast: "Chiaro-Medio", price: 29.90, weight: "250g", notes: "Gelsomino, Mango", rating: 4.9, badge: "bestseller", tone: "redbrown", img: "assets/img/p-colombia.jpg" },
  { id: "guatemala-antigua", name: "Guatemala Antigua Volcánica", cat: "Monorigine", origins: ["Guatemala"], roast: "Medio-Scuro", price: 21.50, weight: "250g", notes: "Cioccolato fondente, Arancia candita", rating: 4.7, badge: null, tone: "charcoal", img: "assets/img/p-guatemala.jpg" },
  { id: "miscela-oro", name: "Miscela Oro — Espresso Italiano", cat: "Miscela Premium", origins: ["Brasile", "Guatemala", "Etiopia"], roast: "Scuro", price: 19.90, weight: "1kg", notes: "Cioccolato, Zucchero caramellato", rating: 4.8, badge: "bestseller", tone: "gold", img: "assets/img/p-oro.jpg" },
  { id: "miscela-nera", name: "Miscela Nera — Decaffeinato Natural", cat: "Miscela Premium", origins: ["Colombia", "Brasile"], roast: "Scuro", price: 17.90, weight: "1kg", notes: "Cacao, Mandorla tostata", rating: 4.5, badge: "decaf", tone: "charcoal", img: "assets/img/p-nera.jpg" },
  { id: "kenya-nyeri", name: "Kenya AA Nyeri", cat: "Monorigine", origins: ["Kenya"], roast: "Chiaro", price: 22.40, weight: "250g", notes: "Ribes nero, Pompelmo", rating: 4.7, badge: null, tone: "redbrown", img: "assets/img/p-kenya.jpg" },
  { id: "costa-rica-tarrazu", name: "Costa Rica Tarrazú", cat: "Monorigine", origins: ["Costa Rica"], roast: "Medio", price: 20.90, weight: "250g", notes: "Miele, Arancia", rating: 4.5, badge: null, tone: "gold", img: "assets/img/p-costarica.jpg" },
  { id: "indonesia-sumatra", name: "Indonesia Sumatra Mandheling", cat: "Monorigine", origins: ["Indonesia"], roast: "Scuro", price: 19.50, weight: "250g", notes: "Tabacco dolce, Cacao", rating: 4.4, badge: null, tone: "charcoal", img: "assets/img/p-sumatra.jpg" },
  { id: "giappone-okinawa", name: "Giappone Okinawa", cat: "Monorigine", origins: ["Giappone"], roast: "Chiaro-Medio", price: 32.00, weight: "250g", notes: "Cioccolato al latte, Ciliegia", rating: 4.6, badge: null, tone: "caramel", img: "assets/img/p-okinawa.jpg" },
  { id: "cina-yunnan", name: "Cina Yunnan", cat: "Monorigine", origins: ["Cina"], roast: "Medio", price: 18.90, weight: "250g", notes: "Tè nero, Prugna", rating: 4.3, badge: null, tone: "green", img: "assets/img/p-yunnan.jpg" },
  { id: "miscela-casa", name: "Miscela Casa — Espresso Classico", cat: "Miscela Premium", origins: ["Brasile", "Colombia"], roast: "Medio-Scuro", price: 15.50, weight: "1kg", notes: "Cacao, Pane tostato", rating: 4.5, badge: null, tone: "brown", img: "assets/img/p-casa.jpg" },
  { id: "capsule-etiopia", name: "Capsule Etiopia Yirgacheffe", cat: "Capsule", origins: ["Etiopia"], roast: "Medio", price: 16.90, weight: "10 capsule", notes: "Gelsomino, Bergamotto", rating: 4.6, badge: null, tone: "brown", img: "assets/img/p-capsule-etiopia.jpg" },
  { id: "capsule-oro", name: "Capsule Miscela Oro", cat: "Capsule", origins: ["Brasile", "Etiopia"], roast: "Scuro", price: 14.90, weight: "10 capsule", notes: "Cioccolato, Caramello", rating: 4.5, badge: null, tone: "gold", img: "assets/img/p-capsule-oro.jpg" },
  { id: "macinacaffe", name: "Macinacaffè Manuale", cat: "Accessori", origins: [], roast: null, price: 39.00, weight: "1 pz", notes: "Macinatura regolabile", rating: 4.7, badge: null, tone: "charcoal", img: "assets/img/p-macinacaffe.jpg" },
];

const ORIGINS = [
  { id: "etiopia", name: "Etiopia", regions: "Yirgacheffe · Sidamo · Guji", region: "Yirgacheffe, Sidamo, Guji", desc: "La culla del caffè Arabica. Le alture etiopi producono caffè floreali e luminosi con note di gelsomino, bergamotto e frutti rossi. Lavorazione prevalentemente lavata o naturale.", notes: ["Note floreali", "Acidità brillante", "Corpo leggero", "Frutti rossi"], process: "Lavato e Naturale", altitude: "1.800–2.200 m", bio: true, tone: "green", img: "assets/img/o-etiopia.jpg" },
  { id: "brasile", name: "Brasile", regions: "Cerrado · Sul de Minas", region: "Cerrado, Sul de Minas", desc: "Il più grande produttore al mondo. Dal Cerrado arrivano caffè morbidi e vellutati, con corpo pieno, bassa acidità e note di cioccolato e frutta secca. Perfetti per l'espresso.", notes: ["Cioccolato", "Nocciola", "Corpo pieno", "Bassa acidità"], process: "Naturale", altitude: "900–1.200 m", bio: false, tone: "caramel", img: "assets/img/o-brasile.jpg" },
  { id: "colombia", name: "Colombia", regions: "Huila · Tolima", region: "Huila, Tolima", desc: "Caffè equilibrati e profumati coltivati sulle Ande. La zona di Huila è celebre per tazze dolci e complesse con sentori di frutta tropicale e caramello.", notes: ["Mango", "Caramello", "Dolcezza", "Equilibrio"], process: "Lavato", altitude: "1.500–1.900 m", bio: false, tone: "redbrown", img: "assets/img/o-colombia.jpg" },
  { id: "kenya", name: "Kenya", regions: "Nyeri · Kirinyaga", region: "Nyeri, Kirinyaga", desc: "Caffè intensi e succosi, con una brillantezza acida inconfondibile. Le alture attorno al monte Kenya donano note di ribes nero, pompelmo e vino rosso.", notes: ["Ribes nero", "Pompelmo", "Acidità brillante", "Succoso"], process: "Lavato", altitude: "1.600–2.100 m", bio: false, tone: "charcoal", img: "assets/img/o-kenya.jpg" },
  { id: "guatemala", name: "Guatemala", regions: "Antigua · Huehuetenango", region: "Antigua, Huehuetenango", desc: "Terreni vulcanici ricchi di minerali danno vita a caffè complessi, con note di cioccolato fondente, agrumi canditi e un corpo strutturato.", notes: ["Cioccolato fondente", "Arancia candita", "Corpo strutturato", "Spezie"], process: "Lavato", altitude: "1.500–1.700 m", bio: false, tone: "brown", img: "assets/img/o-guatemala.jpg" },
  { id: "costa-rica", name: "Costa Rica", regions: "Tarrazú · Naranjo", region: "Tarrazú, Naranjo", desc: "Caffè puliti e dolci, lavorati con cura quasi sempre a miele. Tarrazú regala tazze con note di miele, arancia e frutta a guscio.", notes: ["Miele", "Arancia", "Pulizia", "Dolcezza"], process: "Miele", altitude: "1.200–1.900 m", bio: false, tone: "gold", img: "assets/img/o-costarica.jpg" },
  { id: "indonesia", name: "Indonesia", regions: "Sumatra · Giava", region: "Sumatra, Giava", desc: "Caffè terrosi e corposi, lavorati con il metodo 'giling basah'. Note di tabacco dolce, cacao e spezie, con acidità quasi assente.", notes: ["Tabacco dolce", "Cacao", "Terroso", "Corpo pieno"], process: "Semi-lavato", altitude: "1.000–1.500 m", bio: false, tone: "charcoal", img: "assets/img/o-indonesia.jpg" },
  { id: "giappone", name: "Giappone", regions: "Okinawa · Miyakojima", region: "Okinawa, Miyakojima", desc: "Produzioni rare e pregiate dalle isole meridionali. Tazze delicate e dolci, con note di cioccolato al latte e ciliegia.", notes: ["Cioccolato al latte", "Ciliegia", "Delicatezza", "Rarità"], process: "Lavato", altitude: "100–300 m", bio: true, tone: "caramel", img: "assets/img/o-giappone.jpg" },
  { id: "cina", name: "Cina", regions: "Yunnan · Pu'er", region: "Yunnan, Pu'er", desc: "La provincia dello Yunnan sta emergendo come grande origine. Caffè dolci e setosi con sentori di tè nero e prugna matura.", notes: ["Tè nero", "Prugna", "Setoso", "Dolcezza"], process: "Lavato", altitude: "1.200–1.800 m", bio: false, tone: "green", img: "assets/img/o-cina.jpg" },
];

const ROASTS = ["Chiaro", "Medio", "Chiaro-Medio", "Medio-Scuro", "Scuro"];
const ORIGIN_NAMES = ["Etiopia", "Brasile", "Colombia", "Kenya", "Guatemala", "Costa Rica", "Indonesia", "Giappone", "Cina"];

function findProduct(id) { return PRODUCTS.find(p => p.id === id); }

function stars(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function formatPrice(n) {
  return "€" + n.toFixed(2).replace(".", ",");
}
