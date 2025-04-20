import {NgModule} from "@angular/core";
import {NavigationEnd, Router, RouterModule, Routes} from "@angular/router";
import {HomeComponent} from "./pages/home/home.component";
import {LandingComponent} from "./pages/landing/landing.component";
import {LoginComponent} from "./pages/login/login.component";
import {SignUpComponent} from "./pages/sign-up/sign-up.component";
import {canActivate, redirectLoggedInTo, redirectUnauthorizedTo} from "@angular/fire/auth-guard";
import {ProfileComponent} from "./pages/profile/profile.component";
import {GameComponent} from "./pages/game/game.component";
import {RoomDetailsComponent} from "./pages/room-details/room-details.component";
import {RoomMemberGuard} from "../api/services/room-member-service/roommemberguard.service";
import {PageNotFoundComponent} from "./pages/page-not-found/page-not-found.component";
import {StepsComponent} from "./pages/steps/steps.component";
import {StatsComponent} from "./pages/stats/stats.component";
import {GdprComponent} from "./pages/gdpr/gdpr.component";

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(["login"]);
const redirectLoggedInToHome = () => redirectLoggedInTo(["home"]);

const routes: Routes = [
    {
        path: "",
        pathMatch: "full",
        component: LandingComponent,
    },
    {
        path: "login",
        component: LoginComponent,
        ...canActivate(redirectLoggedInToHome),
    },
    {
        path: "sign-up",
        component: SignUpComponent,
        ...canActivate(redirectLoggedInToHome),
    },
    {
        path: "home",
        component: HomeComponent,
        ...canActivate(redirectUnauthorizedToLogin),
    },
    {
        path: "profile",
        component: ProfileComponent,
        ...canActivate(redirectUnauthorizedToLogin),
    },
    {
        path: 'profile/:uid',
        component: ProfileComponent,
        ...canActivate(redirectUnauthorizedToLogin),
    },
    {
        path: "gdpr",
        component: GdprComponent,
    },
    {
        path: "game",
        component: GameComponent,
    },
    {
        path: "steps",
        component: StepsComponent,
    },
    {path: "room/:code", component: RoomDetailsComponent, canActivate: [RoomMemberGuard]},
    {
        path: "notfound",
        component: PageNotFoundComponent,
    },
    {
        path: 'room/:code/stats',
        component: StatsComponent,
        canActivate: [RoomMemberGuard]
    },
    {path: "**", redirectTo: "notfound"},
];

@NgModule({
    declarations: [],
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {
    constructor(router: Router) {
        router.events.subscribe((event: any) => {
            if (event instanceof NavigationEnd) {
                window.scrollTo({top: 0, behavior: "smooth"});
            }
        });
    }
}
