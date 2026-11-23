import { Component } from '@angular/core';
import { PRODUCTS, Product } from '../products/product-data';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  readonly categories = ['Todos', ...new Set(PRODUCTS.map((product) => product.category))];
  selectedCategory = 'Todos';
  showPurchaseNotice = true;

  get products(): Product[] {
    return this.selectedCategory === 'Todos'
      ? PRODUCTS
      : PRODUCTS.filter((product) => product.category === this.selectedCategory);
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
  }

  dismissPurchaseNotice(): void {
    this.showPurchaseNotice = false;
  }
}
