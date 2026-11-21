import { Component } from '@angular/core';
import { PRODUCTS } from '../products/product-data';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  readonly products = PRODUCTS;
}
