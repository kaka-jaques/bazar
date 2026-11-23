import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'pagamento/retorno',
    loadChildren: () =>
      import('./payment-return/payment-return.module').then(
        (module) => module.PaymentReturnPageModule
      ),
  },
  {
    path: 'produto/:slug',
    loadChildren: () =>
      import('./product-detail/product-detail.module').then(
        (module) => module.ProductDetailPageModule
      ),
  },
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then((module) => module.HomePageModule),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
