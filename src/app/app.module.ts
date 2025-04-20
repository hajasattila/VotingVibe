import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppComponent} from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {AppRoutingModule} from './app-routing.module';
import {LoginComponent} from './pages/login/login.component';
import {SignUpComponent} from './pages/sign-up/sign-up.component';
import {HomeComponent} from './pages/home/home.component';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatIconModule} from '@angular/material/icon';
import {MatLegacyButtonModule as MatButtonModule} from '@angular/material/legacy-button';
import {MatLegacyFormFieldModule as MatFormFieldModule} from '@angular/material/legacy-form-field';
import {MatLegacyInputModule as MatInputModule} from '@angular/material/legacy-input';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {initializeApp, provideFirebaseApp} from '@angular/fire/app';
import {environment} from '../environments/environment';
import {provideAuth, getAuth} from '@angular/fire/auth';
import {provideFirestore, getFirestore} from '@angular/fire/firestore';
import {LandingComponent} from './pages/landing/landing.component';
import {MatLegacyMenuModule as MatMenuModule} from '@angular/material/legacy-menu';
import {ProfileComponent} from './pages/profile/profile.component';
import {getStorage, provideStorage} from '@angular/fire/storage';
import {FooterComponent} from './components/footer/footer.component';
import {FriendListComponent} from './components/friend-list/friend-list.component';
import {ProfileSearchComponent} from './components/profile-search/profile-search.component';
import {UserNamePipe} from '../api/pipes/user-name-pipe/user-name.pipe';
import {ScrollToTopComponent} from './components/scroll-to-top/scroll-to-top.component';
import {GameComponent} from './pages/game/game.component';
import {DatabaseService} from '../api/services/database-service/database.service';
import {RoomDetailsComponent} from './pages/room-details/room-details.component';
import {PageNotFoundComponent} from './pages/page-not-found/page-not-found.component';
import {TextPollComponent} from './components/text-poll/text-poll.component';
import {HttpClientModule, HttpClient} from '@angular/common/http';
import {TranslateModule, TranslateLoader} from '@ngx-translate/core';
import {TranslateHttpLoader} from '@ngx-translate/http-loader';
import {NavBarComponent} from './components/nav-bar/nav-bar.component';
import {MatLegacySnackBarModule as MatSnackBarModule} from '@angular/material/legacy-snack-bar';
import {StepsComponent} from './pages/steps/steps.component';
import {StatsComponent} from './pages/stats/stats.component';
import {NgApexchartsModule} from 'ng-apexcharts';
import {GdprComponent} from "./pages/gdpr/gdpr.component";


export function HttpLoaderFactory(http: HttpClient) {
    return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}


@NgModule({
    declarations: [
        AppComponent,
        LoginComponent,
        SignUpComponent,
        LandingComponent,
        HomeComponent,
        ProfileComponent,
        FooterComponent,
        FriendListComponent,
        ProfileSearchComponent,
        UserNamePipe,
        ScrollToTopComponent,
        GameComponent,
        FriendListComponent,
        RoomDetailsComponent,
        PageNotFoundComponent,
        TextPollComponent,
        NavBarComponent,
        StepsComponent,
        StatsComponent,
        GdprComponent,

    ],
    imports: [
        NgApexchartsModule,
        MatSnackBarModule,
        HttpClientModule,
        BrowserModule,
        BrowserAnimationsModule,
        AppRoutingModule,
        MatToolbarModule,
        MatIconModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        ReactiveFormsModule,
        MatButtonModule,
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        provideAuth(() => getAuth()),
        provideFirestore(() => getFirestore()),
        provideStorage(() => getStorage()),
        MatMenuModule,
        MatButtonModule,
        FormsModule,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        TranslateModule.forRoot({
            defaultLanguage: 'hu',
            loader: {
                provide: TranslateLoader,
                useFactory: HttpLoaderFactory,
                deps: [HttpClient],
            },
        }),
    ],
    providers: [DatabaseService],
    bootstrap: [AppComponent],
})
export class AppModule {
}
