import {
    Component,
    Input,
    OnInit,
    OnChanges,
    SimpleChanges, ChangeDetectorRef, OnDestroy
} from "@angular/core";
import {forkJoin, of, take} from "rxjs";
import {switchMap} from "rxjs/operators";
import {ProfileUser} from "../../../api/models/user.model";
import {UsersService} from "../../../api/services/users-service/users.service";
import {TranslateService} from "@ngx-translate/core";
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";
import {AuthService} from "../../../api/services/auth-service/auth.service";
import {Router} from "@angular/router";
import {RoomModel} from "../../../api/models/room.model";
import {CacheService} from "../../../api/services/cache-service/cache.service";

@Component({
    selector: "app-friend-list",
    templateUrl: "./friend-list.component.html",
    styleUrls: ["./friend-list.component.css"],
})
export class FriendListComponent implements OnInit, OnChanges, OnDestroy {
    @Input() friends: ProfileUser[] = [];
    wasInvited: boolean = false;
    isLoadingFriends = true;
    @Input() invitedUids: string[] = [];


    @Input() set room(value: RoomModel | null) {
        this._room = value;

        if (value?.roomId && this.invitedFriends.size > 0) {
            this.invitedFriends.forEach(uid => {
                this.userService.inviteUserToRoom(
                    uid,
                    value.roomId,
                    value.creator,
                    value.roomName
                ).subscribe({
                    next: () => {
                        this.translate.get('friends.inviteSuccess', {name: uid}).subscribe(msg =>
                            this.snackbar.success(msg)
                        );
                    },
                    error: err => {
                        console.error(err);
                        this.snackbar.error('Hiba a meghívás elküldése közben.');
                    }
                });
            });

            this.invitedFriends.clear();
        }
    }

    private _room: RoomModel | null = null;

    invitedFriends: Set<string> = new Set();
    friendImages: { [uid: string]: string } = {};
    loadedImages: { [uid: string]: boolean } = {};
    currentUserId: string | null = null;
    currentUserDisplayName: string = '';
    showConfirmModal = false;
    selectedFriend: ProfileUser | null = null;
    deletionSuccess = false;
    routePath: string = '';
    private friendsSub: any;


    constructor(
        private userService: UsersService,
        private snackbar: SnackbarService,
        private translate: TranslateService,
        private authService: AuthService,
        private router: Router,
        private cdr: ChangeDetectorRef,
        private cache: CacheService

    ) {
    }

    ngOnInit() {
        this.routePath = this.router.url;

        this.authService.getCurrentUser().subscribe(user => {
            this.currentUserId = user?.uid || null;
            this.currentUserDisplayName = user?.displayName || '';

            if (this.currentUserId) {
                const cachedFriends = this.cache.getFriends(this.currentUserId);
                const cachedImages = this.cache.getFriendImages();
                const cachedLoaded = this.cache.getLoadedImages();

                if (cachedFriends && Object.keys(cachedImages).length > 0 && Object.keys(cachedLoaded).length > 0) {
                    this.friends = cachedFriends;
                    this.friendImages = cachedImages;
                    this.loadedImages = cachedLoaded;
                    this.isLoadingFriends = false;
                    this.cdr.markForCheck();
                } else {
                    this.friendsSub = this.userService.getFriendsLive(this.currentUserId).subscribe(liveFriends => {
                        console.log('💡 Lekért barát UID-k:', liveFriends.map(f => f.uid));

                        const fullProfiles$ = liveFriends.map(f =>
                            this.userService.getUserById(f.uid).pipe(take(1))
                        );

                        forkJoin(fullProfiles$).subscribe(fullFriends => {
                            console.log('📋 Teljes barát adatok:');
                            fullFriends.forEach(friend =>
                                console.log(`👤 ${friend.displayName} (${friend.uid}) - Suspended: ${friend.suspended}`)
                            );

                            this.friends = fullFriends;
                            this.cache.setFriends(this.currentUserId!, fullFriends);
                            this.loadFriendImages();
                            this.cdr.markForCheck();
                        });
                    });


                }
            }
        });
    }



    ngOnDestroy(): void {
        if (this.friendsSub) {
            this.friendsSub.unsubscribe();
        }
    }


    ngOnChanges(changes: SimpleChanges): void {
        if (changes['friends']) {
            this.loadFriendImages();
        }
    }

    loadFriendImages(): void {
        if (!this.friends || this.friends.length === 0) {
            this.isLoadingFriends = false;
            return;
        }

        let loadedCount = 0;
        const images: { [uid: string]: string } = {};
        const loadedFlags: { [uid: string]: boolean } = {};

        for (let friend of this.friends) {
            this.userService.getUserById(friend.uid).pipe(
                switchMap((user: ProfileUser) => {
                    const photoURL = user.photoURL || "/assets/images/image-placeholder.png";
                    images[friend.uid] = photoURL;
                    return of(photoURL);
                })
            ).subscribe((photoURL) => {
                const img = new Image();
                img.onload = () => {
                    loadedFlags[friend.uid] = true;
                    loadedCount++;
                    if (loadedCount === this.friends.length) {
                        this.friendImages = images;
                        this.loadedImages = loadedFlags;
                        this.cache.setFriendImages(images);
                        this.cache.setLoadedImages(loadedFlags);
                        this.isLoadingFriends = false;
                        this.cdr.markForCheck();
                    }
                };
                img.onerror = () => {
                    loadedFlags[friend.uid] = false;
                    images[friend.uid] = "/assets/images/image-placeholder.png";
                    loadedCount++;
                    if (loadedCount === this.friends.length) {
                        this.friendImages = images;
                        this.loadedImages = loadedFlags;
                        this.cache.setFriendImages(images);
                        this.cache.setLoadedImages(loadedFlags);
                        this.isLoadingFriends = false;
                        this.cdr.markForCheck();
                    }
                };
                img.src = photoURL;
            });
        }
    }

    getFriendPhotoURL(uid: string): string {
        return this.loadedImages[uid] ? this.friendImages[uid] : "/assets/images/image-placeholder.png";
    }

    getFriendDisplayName(friend: ProfileUser | undefined): string {
        return friend?.displayName || "Unknown";
    }

    openConfirmModal(friend: ProfileUser) {
        this.userService.getUserById(friend.uid).subscribe((fullFriend) => {
            if (fullFriend?.suspended === true) return;

            if (this.isProfileRoute) {
                this.router.navigate([`/profile/${friend.uid}`]);
                return;
            }

            this.selectedFriend = fullFriend;
            this.showConfirmModal = true;
            this.deletionSuccess = false;
        });
    }

    cancelDelete() {
        this.selectedFriend = null;
        this.showConfirmModal = false;
    }

    confirmDelete() {
        if (!this.selectedFriend) return;

        this.userService.removeFriend(this.selectedFriend).subscribe({
            next: () => {
                this.friends = this.friends.filter(f => f.uid !== this.selectedFriend?.uid);
                this.cache.setFriends(this.currentUserId!, this.friends);
                this.translate.get('friends.removeSuccess', {name: this.selectedFriend?.displayName}).subscribe(msg =>
                    this.snackbar.success(msg)
                );
                this.deletionSuccess = true;

                setTimeout(() => {
                    this.showConfirmModal = false;
                    this.selectedFriend = null;
                }, 1500);
            },
            error: (error) => {
                console.error("Error removing friend:", error);
                this.translate.get('friends.removeError', {name: this.selectedFriend?.displayName}).subscribe(msg =>
                    this.snackbar.error(msg)
                );
                this.showConfirmModal = false;
                this.selectedFriend = null;
            }
        });
    }

    confirmAction() {
        if (!this.selectedFriend) return;
        const uid = this.selectedFriend.uid;

        if (this.isProfileRoute) {
            this.router.navigate([`/profile/${uid}`]);
            return;
        }

        if (!this._room?.roomId) {
            if (this.invitedFriends.has(uid)) {
                this.invitedFriends.delete(uid);
                this.wasInvited = false;
                this.translate.get('friends.unmarkedForInvite', {name: this.selectedFriend.displayName}).subscribe(msg =>
                    this.snackbar.info(msg)
                );
            } else {
                this.invitedFriends.add(uid);
                this.wasInvited = true;
                this.translate.get('friends.markedForInvite', {name: this.selectedFriend.displayName}).subscribe(msg =>
                    this.snackbar.info(msg)
                );
            }
            this.deletionSuccess = true;
        } else {
            this.userService.inviteUserToRoom(
                uid,
                this._room.roomId,
                this._room.creator,
                this._room.roomName
            ).subscribe({
                next: () => {
                    this.translate.get('friends.inviteSuccess', {name: this.selectedFriend!.displayName}).subscribe(msg =>
                        this.snackbar.success(msg)
                    );
                    this.invitedFriends.add(uid);
                    this.wasInvited = true;
                    this.deletionSuccess = true;
                },
                error: (err) => {
                    console.error(`${err.message}`);
                    this.snackbar.error('Hiba történt a meghívás során.');
                }
            });
        }

        setTimeout(() => {
            this.showConfirmModal = false;
            this.selectedFriend = null;
        }, 1500);
    }

    get isProfileRoute(): boolean {
        return this.routePath.includes('/profile');
    }

}
