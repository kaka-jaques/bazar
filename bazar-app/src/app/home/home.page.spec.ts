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

  it('shows the purchase notice on entry with the purchase rules and WhatsApp contact', () => {
    const notice = fixture.nativeElement.querySelector('.purchase-notice');
    const contactLink: HTMLAnchorElement = notice.querySelector('.notice-copy a');

    expect(notice.getAttribute('role')).toBe('dialog');
    expect(notice.getAttribute('aria-modal')).toBe('true');
    expect(notice.textContent).toContain('sinal de 30%');
    expect(notice.textContent).toContain('entrega, o prazo e o frete');
    expect(contactLink.href).toBe('https://wa.me/5547992626735');
    expect(notice.querySelector('.notice-dismiss').textContent.trim()).toBe('Eu entendi!');
  });

  it('closes the purchase notice when acknowledged', () => {
    fixture.nativeElement.querySelector('.notice-dismiss').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.purchase-notice')).toBeNull();
  });

  it('lists every product from the editable catalog', () => {
    const cards = fixture.nativeElement.querySelectorAll('.product-card');

    expect(cards.length).toBe(PRODUCTS.length);
    expect(fixture.nativeElement.textContent).toContain(PRODUCTS[0].name);
  });

  it('filters the catalog by category and restores all products with Todos', () => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.category-filter')
    );
    const targetProduct = PRODUCTS[PRODUCTS.length - 1];
    const targetCategory = targetProduct.category;
    const expectedCategories = ['Todos', ...new Set(PRODUCTS.map((product) => product.category))];
    const categoryButton = buttons.find((button) => button.textContent?.trim() === targetCategory);

    expect(buttons.map((button) => button.textContent?.trim())).toEqual(expectedCategories);
    expect(categoryButton).toBeDefined();

    categoryButton?.click();
    fixture.detectChanges();

    const filteredProducts = PRODUCTS.filter((product) => product.category === targetCategory);
    let cards: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll('.product-card');
    expect(cards.length).toBe(filteredProducts.length);
    expect(Array.from(cards).some((card) => card.textContent?.includes(targetProduct.name))).toBe(true);
    expect(fixture.nativeElement.querySelector('.item-count').textContent)
      .toContain(`${filteredProducts.length} peças`);
    expect(categoryButton?.getAttribute('aria-pressed')).toBe('true');

    buttons[0].click();
    fixture.detectChanges();

    cards = fixture.nativeElement.querySelectorAll('.product-card');
    expect(cards.length).toBe(PRODUCTS.length);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });
});
