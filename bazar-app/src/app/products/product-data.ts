export interface Product {
  slug: string;
  name: string;
  category: string;
  price: number;
  summary: string;
  description: string;
  image: string;
  images: string[];
  condition: string;
  material: string;
  dimensions: string;
  stock: number;
}

export const PRODUCTS: Product[] = [
  {
    slug: 'armario-cozinha',
    name: 'Armário Cozinha',
    category: 'Mobiliário',
    price: 200,
    summary: 'Armário de cozinha em MDF',
    description:
      'Armário de cozinha em MDF com acabamento em pintura UV. Possui portas e gavetas com corrediças metálicas, proporcionando praticidade e durabilidade.',
    image: 'assets/products/poltrona-nuvem.svg',
    images: [
      'assets/products/poltrona-nuvem.svg',
      'assets/products/poltrona-nuvem-detalhe.svg',
    ],
    condition: 'Ótimo estado',
    material: 'MDF',
    dimensions: '78 x 82 x 76 cm',
    stock: 1,
  },
  {
    slug: 'rack-tv',
    name: 'Rack TV',
    category: 'Mobiliário',
    price: 100,
    summary: 'Rack para TV em MDF com acabamento em pintura UV.',
    description:
      'Rack para TV em MDF com acabamento em pintura UV. Possui prateleiras e uma porta dobrável',
    image: 'assets/products/vaso-aurora.svg',
    images: ['assets/products/vaso-aurora.svg', 'assets/products/vaso-aurora-detalhe.svg'],
    condition: 'Bom estado',
    material: 'MDF',
    dimensions: '24 cm de altura',
    stock: 1,
  },
  {
    slug: 'sofa',
    name: 'Sofá',
    category: 'Mobiliário',
    price: 200,
    summary: 'Sofá confortável para sala de estar.',
    description:
      'Sofá de 4 lugares com estofamento em tecido e estrutura em madeira. Ideal para relaxar e receber visitas.',
    image: 'assets/products/luminaria-petala.svg',
    images: [
      'assets/products/luminaria-petala.svg',
      'assets/products/luminaria-petala-detalhe.svg',
    ],
    condition: 'Poucas avarias',
    material: 'Tecido e madeira',
    dimensions: '38 cm de altura',
    stock: 1,
  },
  {
    slug: 'mesa-l',
    name: 'Mesa L',
    category: 'Mobiliário',
    price: 250,
    summary: 'MDP',
    description:
      'Mesa em formato de L, com tampo amplo para apoiar livros, uma bebida ou sua luminária favorita. Fácil de combinar com diferentes estilos.',
    image: 'assets/products/mesa-lateral-noa.svg',
    images: ['assets/products/mesa-lateral-noa.svg', 'assets/products/mesa-lateral-noa-detalhe.svg'],
    condition: 'Novo',
    material: 'Madeira maciça',
    dimensions: '120 x 150 x 76 x 60 cm',
    stock: 1,
  },
];
