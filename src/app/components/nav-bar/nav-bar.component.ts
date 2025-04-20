import {
    Component,
    ChangeDetectionStrategy,
    HostListener,
    ElementRef,
    OnInit,
    OnDestroy, ChangeDetectorRef, ViewChildren, QueryList
} from '@angular/core';
import {AuthService} from "../../../api/services/auth-service/auth.service";
import {UsersService} from "../../../api/services/users-service/users.service";
import {Router, NavigationEnd} from "@angular/router";
import {ThemeService} from "../../../api/services/theme-service/theme-service.service";
import {combineLatest, Observable, of, Subscription, switchMap} from "rxjs";
import {filter, map, take} from "rxjs/operators";
import {TranslateService} from "@ngx-translate/core";
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";
import {CacheService} from "../../../api/services/cache-service/cache.service";

@Component({
    selector: 'app-nav-bar',
    templateUrl: './nav-bar.component.html',
    styleUrls: ['./nav-bar.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavBarComponent implements OnInit, OnDestroy {
    @ViewChildren('friendDropdownRef, friendDropdownReff') friendDropdownRefs!: QueryList<ElementRef>;

    protected user$ = this.usersService.currentUserProfile$;
    protected navbarOpen = false;
    protected profileDropdownOpen = false;

    private routerSubscription!: Subscription;
    protected previousUrl: string = '';

    protected hasFriendRequests$!: Observable<boolean>;
    protected friendRequestDropdownOpen = false;
    protected incomingFriendNames: string[] = [];

    protected hasRoomInvites$!: Observable<boolean>;
    protected combinedNotification$!: Observable<boolean>;

    protected roomInviteMessages: { inviterName: string; roomName: string }[] = [];

    private hasNotifiedFriendRequest = false;
    private hasNotifiedRoomInvite = false;


    constructor(
        private authService: AuthService,
        public usersService: UsersService,
        private router: Router,
        protected themeService: ThemeService,
        private eRef: ElementRef,
        private cdr: ChangeDetectorRef,
        protected translate: TranslateService,
        private snackbar: SnackbarService,
        protected cacheService: CacheService,
    ) {
        this.themeService.initTheme();
        this.initLanguage();
    }

    ngOnInit(): void {
        this.previousUrl = this.router.url;

        this.hasFriendRequests$ = this.usersService.currentUserProfile$.pipe(
            map(user => {
                const hasRequests = !!user && Array.isArray(user.friendRequests) && user.friendRequests.length > 0;

                if (hasRequests && user?.friendRequests) {
                    this.loadFriendRequestNames(user.friendRequests);

                    if (!this.hasNotifiedFriendRequest) {
                        this.hasNotifiedFriendRequest = true;
                        this.translate.get('notifications.friendRequest').subscribe(msg => {
                            this.snackbar.info(msg);
                            this.cdr.markForCheck();
                        });
                    }
                    return true;
                }

                return false;
            })
        );

        this.hasRoomInvites$ = this.usersService.currentUserProfile$.pipe(
            switchMap(user => {
                if (!user?.uid) return of(false);

                return this.usersService.getRoomInvites(user.uid).pipe(
                    map(invites => {
                        const pending = invites.filter(inv => inv.status === 'pending');
                        this.roomInviteMessages = pending.map(invite => ({
                            inviterName: invite.inviterName || 'Ismeretlen',
                            roomName: invite.roomName || 'Szoba'
                        }));

                        if (pending.length > 0 && !this.hasNotifiedRoomInvite) {
                            this.hasNotifiedRoomInvite = true;
                            this.translate.get('notifications.roomInvite').subscribe(msg => {
                                this.snackbar.info(msg);
                                this.cdr.markForCheck();
                            });
                        }

                        return pending.length > 0;
                    })
                );
            })
        );

        this.combinedNotification$ = combineLatest([
            this.hasFriendRequests$,
            this.hasRoomInvites$
        ]).pipe(
            map(([hasFriends, hasRooms]) => hasFriends || hasRooms)
        );

        this.routerSubscription = this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event) => {
                const navigation = event as NavigationEnd;

                if (this.navbarOpen && window.innerWidth < 768) {
                    this.navbarOpen = false;
                    this.cdr.detectChanges();
                }

                this.profileDropdownOpen = false;
                this.friendRequestDropdownOpen = false;
                this.previousUrl = navigation.urlAfterRedirects;
            });
    }


    loadFriendRequestNames(requestIds: string[]): void {
        const uniqueIds = Array.from(new Set(requestIds));
        const nameObservables = uniqueIds.map(id => this.usersService.getUserById(id));

        combineLatest(nameObservables).subscribe(users => {
            const names = users
                .map(user => user?.displayName)
                .filter((name): name is string => !!name);
            this.incomingFriendNames = Array.from(new Set(names));
            this.cdr.markForCheck();
        });
    }


    initLanguage() {
        const savedLang = localStorage.getItem('lang') || 'hu';
        this.translate.setDefaultLang('hu');
        this.translate.use(savedLang);
    }

    ngOnDestroy(): void {
        if (this.routerSubscription) {
            this.routerSubscription.unsubscribe();
        }
    }

    toggleNavbar() {
        this.navbarOpen = !this.navbarOpen;
    }

    toggleProfileDropdown() {
        this.profileDropdownOpen = !this.profileDropdownOpen;
    }

    logout() {
        this.cacheService.clear();
        sessionStorage.removeItem('lastRoomHash');
        sessionStorage.removeItem('lastRoomCharts');
        this.profileDropdownOpen = false;
        this.authService.logout().subscribe(() => {
            this.router.navigate(['/']);
        });
    }

    @HostListener('document:click', ['$event'])
    handleClickOutside(event: Event): void {
        const clickTarget = event.target as HTMLElement;

        if (
            this.profileDropdownOpen &&
            !this.eRef.nativeElement.contains(clickTarget)
        ) {
            this.profileDropdownOpen = false;
        }

        if (
            this.friendRequestDropdownOpen &&
            this.friendDropdownRefs &&
            !this.friendDropdownRefs.some(ref => ref.nativeElement.contains(clickTarget))
        ) {
            this.friendRequestDropdownOpen = false;
        }
    }

    toggleTheme(): void {
        this.themeService.toggleTheme();
    }

    navigateHome() {
        this.user$.pipe(take(1)).subscribe(user => {
            if (user) {
                this.router.navigate(['/home']);
            } else {
                this.router.navigate(['/']);
            }
        });
    }

}
