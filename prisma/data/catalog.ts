// Catálogo de iPhones (nomes de cores como a Apple Brasil divulga). Editável em Configurações → Catálogo.
export type CatalogModel = { name: string; family: string; year: number; colors: string[]; capacities: string[] };

const c11 = ["Preto", "Branco", "Verde", "Amarelo", "Roxo", "(PRODUCT)RED"];
const c11Pro = ["Cinza-espacial", "Prateado", "Dourado", "Verde-meia-noite"];
const c12 = ["Preto", "Branco", "Azul", "Verde", "Roxo", "(PRODUCT)RED"];
const c12Pro = ["Grafite", "Prateado", "Dourado", "Azul-pacífico"];
const c13 = ["Meia-noite", "Estelar", "Azul", "Rosa", "Verde", "(PRODUCT)RED"];
const c13Pro = ["Grafite", "Prateado", "Dourado", "Azul-sierra", "Verde-alpino"];
const c14 = ["Meia-noite", "Estelar", "Azul", "Roxo", "Amarelo", "(PRODUCT)RED"];
const c14Pro = ["Preto-espacial", "Prateado", "Dourado", "Roxo-profundo"];
const c15 = ["Preto", "Azul", "Verde", "Amarelo", "Rosa"];
const c15Pro = ["Titânio natural", "Titânio azul", "Titânio branco", "Titânio preto"];
const c16 = ["Preto", "Branco", "Rosa", "Verde-acinzentado", "Ultramarino"];
const c16Pro = ["Titânio-deserto", "Titânio natural", "Titânio branco", "Titânio preto"];
const c17 = ["Preto", "Branco", "Azul-névoa", "Lavanda", "Sálvia"];
const cAir = ["Preto-espacial", "Branco-nuvem", "Dourado-claro", "Azul-céu"];
const c17Pro = ["Laranja-cósmico", "Azul-intenso", "Prateado"];
// nomes oficiais da Apple Brasil (apple.com/br/iphone-18-pro/specs)
const c18Pro = ["Preto", "Prateado", "Glacial", "Bordô"];
const cDuo = ["Branco-estrela", "Céu noturno"];

export const CATALOG: CatalogModel[] = [
  { name: "iPhone 11", family: "iPhone 11", year: 2019, colors: c11, capacities: ["64GB", "128GB", "256GB"] },
  { name: "iPhone 11 Pro", family: "iPhone 11", year: 2019, colors: c11Pro, capacities: ["64GB", "256GB", "512GB"] },
  { name: "iPhone 11 Pro Max", family: "iPhone 11", year: 2019, colors: c11Pro, capacities: ["64GB", "256GB", "512GB"] },
  { name: "iPhone 12 mini", family: "iPhone 12", year: 2020, colors: c12, capacities: ["64GB", "128GB", "256GB"] },
  { name: "iPhone 12", family: "iPhone 12", year: 2020, colors: c12, capacities: ["64GB", "128GB", "256GB"] },
  { name: "iPhone 12 Pro", family: "iPhone 12", year: 2020, colors: c12Pro, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 12 Pro Max", family: "iPhone 12", year: 2020, colors: c12Pro, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 13 mini", family: "iPhone 13", year: 2021, colors: c13, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 13", family: "iPhone 13", year: 2021, colors: c13, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 13 Pro", family: "iPhone 13", year: 2021, colors: c13Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 13 Pro Max", family: "iPhone 13", year: 2021, colors: c13Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 14", family: "iPhone 14", year: 2022, colors: c14, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 14 Plus", family: "iPhone 14", year: 2022, colors: c14, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 14 Pro", family: "iPhone 14", year: 2022, colors: c14Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 14 Pro Max", family: "iPhone 14", year: 2022, colors: c14Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 15", family: "iPhone 15", year: 2023, colors: c15, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 15 Plus", family: "iPhone 15", year: 2023, colors: c15, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 15 Pro", family: "iPhone 15", year: 2023, colors: c15Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 15 Pro Max", family: "iPhone 15", year: 2023, colors: c15Pro, capacities: ["256GB", "512GB", "1TB"] },
  { name: "iPhone 16", family: "iPhone 16", year: 2024, colors: c16, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 16 Plus", family: "iPhone 16", year: 2024, colors: c16, capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 16 Pro", family: "iPhone 16", year: 2024, colors: c16Pro, capacities: ["128GB", "256GB", "512GB", "1TB"] },
  { name: "iPhone 16 Pro Max", family: "iPhone 16", year: 2024, colors: c16Pro, capacities: ["256GB", "512GB", "1TB"] },
  { name: "iPhone 16e", family: "iPhone 16", year: 2025, colors: ["Preto", "Branco"], capacities: ["128GB", "256GB", "512GB"] },
  { name: "iPhone 17", family: "iPhone 17", year: 2025, colors: c17, capacities: ["256GB", "512GB"] },
  { name: "iPhone Air", family: "iPhone 17", year: 2025, colors: cAir, capacities: ["256GB", "512GB", "1TB"] },
  { name: "iPhone 17 Pro", family: "iPhone 17", year: 2025, colors: c17Pro, capacities: ["256GB", "512GB", "1TB"] },
  { name: "iPhone 17 Pro Max", family: "iPhone 17", year: 2025, colors: c17Pro, capacities: ["256GB", "512GB", "1TB", "2TB"] },
  { name: "iPhone 18 Pro", family: "iPhone 18", year: 2026, colors: c18Pro, capacities: ["256GB", "512GB", "1TB", "2TB"] },
  { name: "iPhone 18 Pro Max", family: "iPhone 18", year: 2026, colors: c18Pro, capacities: ["256GB", "512GB", "1TB", "2TB"] },
  { name: "iPhone Duo", family: "iPhone 18", year: 2026, colors: cDuo, capacities: ["256GB", "512GB", "1TB", "2TB"] },
];
