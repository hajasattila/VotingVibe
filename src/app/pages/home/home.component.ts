import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {AuthService} from 'src/api/services/auth-service/auth.service';
import {Router} from "@angular/router";
import {ThemeService} from "../../../api/services/theme-service/theme-service.service";
import {TranslateService} from "@ngx-translate/core";
import {RoomModel} from "../../../api/models/room.model";
import {UsersService} from "../../../api/services/users-service/users.service";
import {RoomInvite} from "../../../api/models/roomInvitation.model";
import {DatabaseService} from "../../../api/services/database-service/database.service";
import {ActivatedRoute} from '@angular/router';
import {HttpClient} from "@angular/common/http";
import {environment} from 'src/environments/environment';
import {ProfileUser} from "../../../api/models/user.model";
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";
import {of, switchMap} from "rxjs";
import {map} from "rxjs/operators";
import {ChartOptions} from "../../../api/models/chartOptions.model";
import {CacheService} from "../../../api/services/cache-service/cache.service";


@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {

    constructor(private readonly authService: AuthService,
                private readonly router: Router,
                protected themeService: ThemeService,
                protected translate: TranslateService,
                private userService: UsersService,
                protected dbService: DatabaseService,
                private route: ActivatedRoute,
                private http: HttpClient,
                private snackbar: SnackbarService,
                private cacheService: CacheService,
                private cdr: ChangeDetectorRef
    ) {
    }

    protected menuOpen = false;
    showRoomModal: boolean = false;
    userRooms: RoomModel[] = [];

    showRoomInviteModal = false;
    roomInvites: RoomInvite[] = [];

    currentUserUid: string | null = null;
    nickname: string | null = null;

    quote: string | null = null;

    loadedImages: Record<string, boolean> = {};
    randomUsersNotFriends: ProfileUser[] = [];

    isRandomUsersLoading: boolean = true;

    public lastRoomCharts: { title: string, code: string, options: ChartOptions }[] = [];

    isStatsLoading: boolean = true;

    quoteRequestsLeft: number = 3;
    readonly MAX_QUOTES_PER_DAY = 3;
    readonly QUOTE_KEY = 'daily_quote_count';
    readonly QUOTE_TIME_KEY = 'daily_quote_time';

    ngOnInit(): void {
        this.loadQuoteLimit();
        this.quote = localStorage.getItem('daily_quote');

        this.loadLastRoomStats();
        this.loadFriendListWithCache();

        this.authService.getCurrentUser().subscribe(user => {
            if (user?.uid) {
                this.currentUserUid = user.uid;

                this.userService.getUserById(user.uid).subscribe(profile => {
                    if (profile?.displayName && profile.displayName !== this.nickname) {
                        this.nickname = profile.displayName;
                        localStorage.setItem('nickname', this.nickname);
                    }
                });
            }
        });

        this.loadLatestUsers();

        const cachedName = localStorage.getItem('nickname');
        if (cachedName) {
            this.nickname = cachedName;
        }

        this.route.queryParams.subscribe(params => {
            const openModal = params['openModal'];
            if (openModal === 'rooms') {
                this.openRoomModal();
            } else if (openModal === 'invites') {
                this.openInviteModal();
            }
        });
    }

    private loadFriendListWithCache(): void {
        const cachedFriendsStr = sessionStorage.getItem('friendList');
        const cachedUid = sessionStorage.getItem('friendListUid');

        this.authService.getCurrentUser().subscribe(user => {
            if (!user?.uid) return;

            const memoryFriends = this.cacheService.getFriends(user.uid);

            if (memoryFriends) {
                this.loadRandomUsersNotFriends(user.uid, memoryFriends);
                return;
            }

            if (cachedFriendsStr && cachedUid === user.uid) {
                const parsed = JSON.parse(cachedFriendsStr) as ProfileUser[];
                this.cacheService.setFriends(user.uid, parsed);
                this.loadRandomUsersNotFriends(user.uid, parsed);
                return;
            }

            this.userService.getFriendsLive(user.uid).subscribe(friends => {
                sessionStorage.setItem('friendList', JSON.stringify(friends));
                sessionStorage.setItem('friendListUid', user.uid);
                this.cacheService.setFriends(user.uid, friends);
                this.loadRandomUsersNotFriends(user.uid, friends);
            });
        });
    }

    private loadRandomUsersNotFriends(currentUid: string, friends: ProfileUser[]): void {
        this.userService.getUsersNotInFriendList(currentUid).pipe(
            map(users =>
                users.filter(u =>
                    u.uid !== currentUid &&
                    !friends.some(f => f.uid === u.uid)
                )
            )
        ).subscribe(filtered => {
            this.randomUsersNotFriends = this.getRandomUsers(filtered, 5);
            this.isRandomUsersLoading = false;
            this.cdr.detectChanges();
        });
    }


    private loadLatestUsers(): void {
        this.authService.getCurrentUser().pipe(
            switchMap(currentUser => {
                if (!currentUser?.uid) return of([]);
                return this.userService.getFriends(currentUser.uid).pipe(
                    switchMap(friends => {

                        const friendUids = friends.map(f => f.uid);
                        return this.userService.getLatestUsers(20).pipe(
                            map(users => users
                                .filter(u => u.uid !== currentUser.uid && !friendUids.includes(u.uid))
                                .slice(0, 5)
                            )
                        );
                    })
                );
            })
        )
    }

    private getRandomUsers(users: ProfileUser[], count: number): ProfileUser[] {
        const shuffled = [...users].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }


    // sendFriendRequest(user: ProfileUser): void {
    //     if (!this.currentUserUid || !user.uid) return;
    //
    //     this.userService.sendFriendRequest(this.currentUserUid, user.uid).subscribe({
    //         next: () => {
    //             this.translate.get('search.successRequestSent', {name: user.displayName || 'felhasználó'})
    //                 .subscribe(msg => this.snackbar.success(msg));
    //         },
    //         error: () => {
    //             this.translate.get('search.errorSendFailed', {name: user.displayName || 'felhasználó'})
    //                 .subscribe(msg => this.snackbar.error(msg));
    //         }
    //     });
    // }

    goToProfile(uid: string): void {
        if (uid && uid !== this.currentUserUid) {
            this.router.navigate([`/profile/${uid}`]);
        }
    }


    getMotivationalQuote(): void {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const quoteTimestamp = Number(localStorage.getItem(this.QUOTE_TIME_KEY));
        const quoteCount = Number(localStorage.getItem(this.QUOTE_KEY)) || 0;

        if (quoteTimestamp && now - quoteTimestamp > oneDay) {
            localStorage.setItem(this.QUOTE_TIME_KEY, now.toString());
            localStorage.setItem(this.QUOTE_KEY, '0');
            this.quoteRequestsLeft = this.MAX_QUOTES_PER_DAY;
        }

        if (this.quoteRequestsLeft <= 0) {
            this.translate.get('home.hero.limitReached').subscribe(msg => this.snackbar.error(msg));
            return;
        }

        const headers = {'X-Api-Key': environment.quotesApiKey};

        this.http.get<any>('https://api.api-ninjas.com/v1/quotes', {headers}).subscribe({
            next: (data) => {
                if (data.length > 0) {
                    this.quote = `"${data[0].quote}" — ${data[0].author}`;
                    localStorage.setItem('daily_quote', this.quote);

                    const newCount = quoteCount + 1;
                    localStorage.setItem(this.QUOTE_KEY, newCount.toString());
                    this.quoteRequestsLeft = this.MAX_QUOTES_PER_DAY - newCount;
                }
            },
            error: () => {
                this.quote = null;
            }
        });
    }

    roomQuery: string = '';

    filteredRooms(): RoomModel[] {
        const q = this.roomQuery?.trim().toLowerCase();
        if (!q) return this.userRooms;
        return this.userRooms.filter(room => room.roomName?.toLowerCase().includes(q));
    }

    logout() {
        this.cacheService.clear();
        sessionStorage.removeItem('lastRoomHash');
        sessionStorage.removeItem('lastRoomCharts');
        this.authService.logout().subscribe(() => {
            this.router.navigate(['/']);
        });
    }


    toggleTheme(): void {
        this.themeService.toggleTheme();
    }

    changeLanguage(event: Event): void {
        const lang = (event.target as HTMLSelectElement).value;
        this.translate.use(lang);
        localStorage.setItem('lang', lang);
    }


    toggleSideMenu() {
        this.menuOpen = !this.menuOpen;
    }

    isRoomLoading: boolean = false;

    openRoomModal(): void {
        this.showRoomModal = true;
        this.isRoomLoading = true;

        this.authService.getCurrentUser().subscribe((user) => {
            if (user) {
                this.dbService.getRoomsForUser(user.uid).subscribe((rooms) => {
                    this.userRooms = rooms
                        .map(room => ({
                            ...room,
                            createdAt: this.normalizeTimestamp(room.createdAt)
                        }))
                        .sort((a, b) => {
                            const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
                            const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
                            return dateB - dateA;
                        })


                    this.isRoomLoading = false;
                });
            } else {
                this.isRoomLoading = false;
            }
        });

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {openModal: null},
            queryParamsHandling: 'merge'
        });
    }


    closeRoomModal(): void {
        this.showRoomModal = false;

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {openModal: null},
            queryParamsHandling: 'merge'
        });

    }

    navigateToRoom(room: RoomModel): void {
        this.closeRoomModal();
        this.router.navigate(['/room', room.roomId]);
    }

    openInviteModal(): void {
        this.showRoomInviteModal = true;

        this.authService.getCurrentUser().subscribe((user) => {
            if (user) {
                this.userService.getRoomInvites(user.uid).subscribe((invites) => {
                    this.roomInvites = invites.filter(invite => invite.status === 'pending');
                });
            }
        });
    }

    closeInviteModal(): void {
        this.showRoomInviteModal = false;

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {openModal: null},
            queryParamsHandling: 'merge'
        });
    }


    acceptInvite(invite: RoomInvite): void {
        this.authService.getCurrentUser().subscribe(user => {
            if (!user) {
                return;
            }

            this.userService.getUserById(user.uid).subscribe(profile => {
                if (!profile) {
                    return;
                }
                this.dbService.addUserToRoomByCode(invite.roomId, profile).subscribe(() => {
                    this.userService.updateInviteStatus(user.uid, invite.roomId, 'accepted').subscribe(() => {
                        this.router.navigate(['room', invite.roomId])
                    });
                });
            });
        });
    }


    rejectInvite(invite: RoomInvite): void {
        this.authService.getCurrentUser().subscribe(user => {
            if (user) {
                this.userService.updateInviteStatus(user.uid, invite.roomId, 'rejected').subscribe(() => {
                    this.roomInvites = this.roomInvites.filter(i => i.roomId !== invite.roomId);
                });
            }
        });
    }

    private normalizeTimestamp(value: any): Date {
        if (value instanceof Date) {
            return value;
        }
        if (value?.seconds) {
            return new Date(value.seconds * 1000);
        }
        return new Date(0);
    }


    private loadLastRoomStats(): void {
        const memoryCache = this.cacheService.getRooms();
        const cachedHash = sessionStorage.getItem('lastRoomHash');
        const cachedCharts = sessionStorage.getItem('lastRoomCharts');

        if (cachedCharts && cachedHash) {
            this.lastRoomCharts = JSON.parse(cachedCharts);
            this.isStatsLoading = false;
        }

        this.authService.getCurrentUser().subscribe(user => {
            if (!user?.uid) return;

            const handleRooms = (rooms: RoomModel[]) => {
                const validRooms = rooms.filter(r => !!r.pollResults && !!r.poll?.options);

                if (validRooms.length === 0) {
                    this.lastRoomCharts = [];
                    this.isStatsLoading = false;
                    return;
                }

                const randomRooms = [...validRooms].sort(() => 0.5 - Math.random()).slice(0, 3);
                this.cacheService.setRooms(randomRooms);
                this.processRooms(randomRooms, cachedHash, cachedCharts);
            };


            if (memoryCache) {
                handleRooms(memoryCache);
                return;
            }

            this.dbService.getRoomsForUser(user.uid).subscribe(rooms => {
                handleRooms(rooms);
            });
        });
    }

    private processRooms(rooms: RoomModel[], cachedHash: string | null, cachedCharts: string | null): void {

        const sortedRooms = rooms
            .filter(room => !!room.pollResults && !!room.poll?.options)
            .sort((a, b) => {
                const dateA = a.createdAt ? a.createdAt.getTime() : 0;
                const dateB = b.createdAt ? b.createdAt.getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, 3);

        const roomHash = JSON.stringify(sortedRooms.map(r => ({
            id: r.roomId,
            updated: (r.updatedAt || r.createdAt)?.toString()
        })));

        if (roomHash === cachedHash && cachedCharts) return;

        this.lastRoomCharts = sortedRooms.map(room => {
            const isDark = document.documentElement.classList.contains('dark');
            const pollResults = room.pollResults!;
            const code = room.roomId;

            const originalOptions = room.poll!.options;

            const labels: string[] = [];
            const optionMap: { [label: string]: string } = {}; // label -> original

            originalOptions.forEach((opt, i) => {
                const isImageUrl = /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i.test(opt) || opt.startsWith('https://firebasestorage.googleapis.com');
                const label = isImageUrl ? `🖼️ Kép ${i + 1}` : opt;
                labels.push(label);
                optionMap[label] = opt;
            });

            const series = labels.map(label => {
                const originalOption = optionMap[label];
                return Object.values(pollResults).reduce((sum, userVotes) => {
                    return sum + (userVotes?.[originalOption] || 0);
                }, 0);
            });

            return {
                title: room.roomName,
                code,
                options: {
                    series,
                    chart: {
                        type: 'pie',
                        height: '100%',
                        width: '100%',
                    },
                    labels,
                    title: {
                        text: room.roomName,
                        style: {
                            color: isDark ? '#f3f4f6' : '#1f2937',
                            fontSize: '18px',
                            fontWeight: 'bold'
                        }
                    },
                    theme: {
                        mode: isDark ? 'dark' : 'light'
                    },
                    legend: {
                        labels: {
                            colors: isDark ? '#f3f4f6' : '#1f2937'
                        }
                    },
                    responsive: [
                        {
                            breakpoint: 480,
                            options: {
                                chart: {
                                    width: 280
                                },
                                legend: {
                                    position: 'bottom'
                                }
                            }
                        }
                    ]
                }
            };
        });


        sessionStorage.setItem('lastRoomHash', roomHash);
        sessionStorage.setItem('lastRoomCharts', JSON.stringify(this.lastRoomCharts));
        this.isStatsLoading = false;
    }

    navigateToRoomByCode(code: string): void {
        this.router.navigate(['/room', code, 'stats']);
    }

    private loadQuoteLimit(): void {
        const now = Date.now();
        const quoteTimestamp = Number(localStorage.getItem(this.QUOTE_TIME_KEY));
        const quoteCount = Number(localStorage.getItem(this.QUOTE_KEY)) || 0;
        const oneDay = 24 * 60 * 60 * 1000;

        if (!quoteTimestamp || now - quoteTimestamp > oneDay) {
            this.quoteRequestsLeft = this.MAX_QUOTES_PER_DAY;
            localStorage.setItem(this.QUOTE_TIME_KEY, now.toString());
            localStorage.setItem(this.QUOTE_KEY, '0');
        } else {
            this.quoteRequestsLeft = this.MAX_QUOTES_PER_DAY - quoteCount;
        }
    }


}
