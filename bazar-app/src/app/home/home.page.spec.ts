import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { PRODUCTS } from '../products/product-data';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [CommonModule, IonicModule.forRoot(), RouterModule.forRoot([])]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lists every product from the editable catalog', () => {
    const cards = fixture.nativeElement.querySelectorAll('.product-card');

    expect(cards.length).toBe(PRODUCTS.length);
    expect(fixture.nativeElement.textContent).toContain(PRODUCTS[0].name);
  });
});
