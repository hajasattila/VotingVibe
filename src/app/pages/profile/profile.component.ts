import {ChangeDetectorRef, Component, Input, OnInit} from "@angular/core";
import {NonNullableFormBuilder, Validators} from "@angular/forms";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {first, switchMap, take, tap} from "rxjs";
import {ProfileUser} from "src/api/models/user.model";
import {ImageUploadService} from "src/api/services/image-upload-service/image-upload.service";
import {UsersService} from "src/api/services/users-service/users.service";
import {AuthService} from "src/api/services/auth-service/auth.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";
import {TranslateService} from "@ngx-translate/core";
import {ImageCompressorService} from "../../../api/services/image-compress-service/imagecompress.service";
import {DatabaseService} from "../../../api/services/database-service/database.service";
import {RoomModel} from "../../../api/models/room.model";

@UntilDestroy()
@Component({
    selector: "app-profile",
    templateUrl: "./profile.component.html",
    styleUrls: ["./profile.component.css"],
})
export class ProfileComponent implements OnInit {
    user$ = this.usersService.currentUserProfile$;
    user?: ProfileUser;
    showFriendRequests = true;
    @Input() friends: ProfileUser[] = [];

    imageLoaded: boolean = false;
    fallbackImage: string = '../../assets/images/image-placeholder.png';

    createdRoomsCount: number = 0;
    joinedRoomsCount: number = 0;

    showImageModal = false;
    modalImageUrl: string | null = null;

    readonlyProfile = false;

    isLoading: boolean = true;

    profileForm = this.fb.group({
        uid: [""],
        displayName: ["", [Validators.required, Validators.maxLength(12)]],
        firstName: ["", [Validators.required, Validators.maxLength(12)]],
        lastName: ["", [Validators.required, Validators.maxLength(12)]],
        phone: ["", [Validators.required, Validators.pattern(/^06\d{9}$/)]],
        description: ["", [Validators.maxLength(100)]],
    });

    constructor(
        private imageUploadService: ImageUploadService,
        private usersService: UsersService,
        private authService: AuthService,
        private fb: NonNullableFormBuilder,
        private cdRef: ChangeDetectorRef,
        private router: Router,
        private snackbar: SnackbarService,
        private translate: TranslateService,
        private imageCompressor: ImageCompressorService,
        private databaseService: DatabaseService,
        private route: ActivatedRoute,
    ) {
    }

    ngOnInit(): void {
        const currentUrl = this.router.url;
        const isReadonlyByUrl = currentUrl.startsWith('/profile/') && currentUrl !== '/profile';

        this.profileForm = this.fb.group({
            uid: [""],
            displayName: ["", [Validators.required, Validators.maxLength(12)]],
            firstName: ["", [Validators.required, Validators.maxLength(12)]],
            lastName: ["", [Validators.required, Validators.maxLength(12)]],
            phone: ["", [Validators.required, Validators.pattern(/^06\d{9}$/)]],
            description: ["", [Validators.maxLength(100)]],
        });

        if (isReadonlyByUrl) {
            this.profileForm.disable();
            this.readonlyProfile = true;
        }

        this.initializeProfile();
    }

    private initializeProfile(): void {
        this.authService.currentUser$.pipe(
            first(),
            switchMap(currentUser => {
                if (!currentUser) {
                    this.router.navigate(['/login']);
                    return [];
                }

                this.currentUserIdInternal = currentUser.uid;

                return this.route.paramMap.pipe(
                    switchMap(params => {
                        const routeUid = params.get('uid');
                        const uidToLoad = routeUid || currentUser.uid;
                        const isOwnProfile = uidToLoad === currentUser.uid;

                        this.readonlyProfile = !isOwnProfile;

                        return this.usersService.getUserById(uidToLoad).pipe(
                            tap(user => {
                                if (!user) {
                                    this.translate.get('profile.error.userNotFound').subscribe(msg => this.snackbar.error(msg));
                                    this.router.navigate(['/']);
                                    this.isLoading = false;
                                    return;
                                }

                                this.user = user;
                                this.profileForm.patchValue({
                                    uid: user.uid,
                                    displayName: user.displayName,
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    phone: user.phone,
                                    description: user.description,
                                });

                                this.cdRef.detectChanges();

                                const cached = sessionStorage.getItem(`rooms_${user.uid}`);
                                const parsed = cached ? JSON.parse(cached) : null;

                                if (parsed?.rooms?.length) {
                                    this.setRoomCounts(parsed.rooms);
                                }

                                this.databaseService.getRoomsForUser(user.uid).pipe(
                                    take(1),
                                    tap((rooms) => {
                                        if (!parsed || parsed.rooms.length !== rooms.length) {
                                            this.setRoomCounts(rooms);
                                            sessionStorage.setItem(`rooms_${user.uid}`, JSON.stringify({rooms}));
                                        }
                                        this.isLoading = false;
                                    })
                                ).subscribe({
                                    complete: () => {
                                        this.isLoading = false;
                                    }
                                });
                            })
                        );
                    })
                );
            }),
            untilDestroyed(this)
        ).subscribe({
            error: (err) => {
                console.error("Error loading profile:", err);
                this.translate.get('profile.error.fetchUser').subscribe(msg => this.snackbar.error(msg));
                this.isLoading = false;
            }
        });
    }

    private setRoomCounts(rooms: (RoomModel & { isCreator: boolean })[]) {
        this.createdRoomsCount = rooms.filter(r => r.isCreator).length;
        this.joinedRoomsCount = rooms.length;
        this.cdRef.detectChanges();
    }

    uploadFile(event: any, {uid}: ProfileUser) {
        if (this.readonlyProfile) return;

        const file = event.target.files[0];
        if (!file) return;

        const originalSizeKB = (file.size / 1024).toFixed(2);

        this.translate.get('profile.upload.loading').subscribe(loadingMsg => {
            this.snackbar.info(`${loadingMsg} (${originalSizeKB} KB)`);

            this.imageCompressor.compressImage(file, 0.6, 600).then((compressedFile) => {
                const compressedSizeKB = (compressedFile.size / 1024).toFixed(2);

                this.translate.get('profile.upload.compressed', {
                    original: originalSizeKB,
                    compressed: compressedSizeKB
                }).subscribe(msg => {
                    this.snackbar.success(msg);
                });

                const imagePath = `images/profile/${uid}`;

                this.imageUploadService.deleteImageByPath(imagePath)
                    .catch((err) => {
                        console.error(err);
                    })
                    .finally(() => {
                        this.imageUploadService
                            .uploadImage(compressedFile, imagePath)
                            .pipe(
                                switchMap((photoURL) => {
                                    return this.usersService.updateUser({uid, photoURL});
                                })
                            )
                            .subscribe({
                                next: () => {
                                    this.translate.get('profile.upload.success').subscribe(msg => this.snackbar.success(msg));
                                },
                                error: () => {
                                    this.translate.get('profile.upload.error').subscribe(msg => this.snackbar.error(msg));
                                },
                            });
                    });
            }).catch(error => {
                console.error('❌ Képtömörítési hiba:', error);
                this.translate.get('profile.upload.error').subscribe(msg => this.snackbar.error(msg));
            });
        });
    }

    saveProfile() {
        if (this.readonlyProfile) return;

        const {uid, ...data} = this.profileForm.value;
        let displayName = this.profileForm.get("displayName")?.value?.trim();

        if (!uid || !displayName || this.profileForm.invalid) {
            this.translate.get('profile.error.invalidForm').subscribe(msg => this.snackbar.error(msg));
            return;
        }

        this.usersService.isDisplayNameTaken(displayName, uid).pipe(take(1)).subscribe((isTaken) => {
            if (isTaken) {
                this.translate.get('profile.error.nameTaken').subscribe(msg => this.snackbar.error(msg));
                return;
            }

            this.usersService.updateUser({uid, displayName, ...data}).subscribe({
                next: () => {
                    this.translate.get('profile.success.updated').subscribe(msg => this.snackbar.success(msg));
                    this.router.navigate(["/profile"]);
                },
                error: () => {
                    this.translate.get('profile.error.updateFailed').subscribe(msg => this.snackbar.error(msg));
                },
            });
        });
    }

    resetPassword(event: Event): void {
        event.stopPropagation();
        event.preventDefault();
        this.showResetModal = true;
    }


    showResetModal = false;

    confirmResetPassword(): void {
        this.user$.pipe(take(1)).subscribe((user) => {
            if (user && user.email) {
                const email = user.email;
                this.authService.resetPassword(email).subscribe(
                    () => {
                        this.translate.get('profile.resetPasswordSuccess').subscribe(msg => this.snackbar.success(msg));
                        this.showResetModal = false;
                    },
                    (error) => {
                        console.error("Error sending password reset email", error);
                        this.translate.get('profile.resetPasswordError').subscribe(msg => this.snackbar.error(msg));
                        this.showResetModal = false;
                    }
                );
            } else {
                this.translate.get('profile.error.noEmail').subscribe(msg => this.snackbar.error(msg));
                this.showResetModal = false;
            }
        });
    }

    acceptFriendRequest(requestingUserId: string) {
        if (!this.user) {
            this.translate.get('profile.error.noUser').subscribe(msg => this.snackbar.error(msg));
            return;
        }

        this.usersService.getUserById(requestingUserId).subscribe({
            next: (requestingUser) => {
                if (!requestingUser) {
                    this.translate.get('profile.error.userNotFound').subscribe(msg => this.snackbar.error(msg));
                    return;
                }

                this.usersService.acceptFriendRequest(this.user!.uid, requestingUserId).subscribe({
                    next: () => {
                        this.translate.get('profile.success.friendAccepted', {name: requestingUser.displayName}).subscribe(msg => this.snackbar.success(msg));
                        this.router.navigateByUrl("/profile");
                    },
                    error: () => {
                        this.translate.get('profile.error.friendAcceptFailed').subscribe(msg => this.snackbar.error(msg));
                    }
                });
            },
            error: () => {
                this.translate.get('profile.error.userNotFound').subscribe(msg => this.snackbar.error(msg));
            }
        });
    }

    rejectFriendRequest(requestingUserId: string) {
        if (!this.user) {
            this.translate.get('profile.error.noUser').subscribe(msg => this.snackbar.error(msg));
            return;
        }

        this.usersService.getUserById(requestingUserId).pipe(take(1)).subscribe({
            next: (requestingUser) => {
                if (!requestingUser) {
                    this.translate.get('profile.error.userNotFound').subscribe(msg => this.snackbar.error(msg));
                    return;
                }

                this.usersService.rejectFriendRequest(this.user!.uid, requestingUserId).subscribe({
                    next: () => {
                        this.translate.get('profile.success.friendRejected', {name: requestingUser.displayName}).subscribe(msg => this.snackbar.info(msg));
                        this.router.navigateByUrl("/profile");
                    },
                    error: () => {
                        this.translate.get('profile.error.friendRejectFailed').subscribe(msg => this.snackbar.error(msg));
                    }
                });
            },
            error: () => {
                this.translate.get('profile.error.userNotFound').subscribe(msg => this.snackbar.error(msg));
            }
        });
    }

    openImageModal(url: string | undefined | null) {
        this.modalImageUrl = url || this.fallbackImage;
        this.showImageModal = true;
    }

    get isFriendRequestSent(): boolean {
        return !!this.user?.friendRequests?.includes(this.currentUserId);
    }

    closeImageModal() {
        this.showImageModal = false;
        this.modalImageUrl = null;
    }

    showConfirmModal = false;
    selectedUserToModify: ProfileUser | null = null;
    isFriend = false;

    private currentUserIdInternal: string = '';

    get currentUserId(): string {
        return this.currentUserIdInternal;
    }


    confirmFriendAction() {
        if (!this.selectedUserToModify || !this.user?.uid) return;

        const currentUserId = this.user.uid;
        const friendId = this.selectedUserToModify.uid;

        if (this.isFriend) {
            this.user = {
                ...this.user,
                friendList: this.user.friendList?.filter(f => f.uid !== friendId) || [],
                sentFriendRequests: this.user.sentFriendRequests?.filter(id => id !== friendId),
                friendRequests: this.user.friendRequests?.filter(id => id !== friendId)
            };
            localStorage.removeItem('currentUserProfile');

            this.usersService.removeFriend(this.selectedUserToModify).subscribe({
                next: () => {
                    this.translate.get('friends.removeSuccess', { name: this.selectedUserToModify?.displayName }).subscribe(msg =>
                        this.snackbar.success(msg)
                    );
                    this.isFriend = false;
                    this.showConfirmModal = false;
                    this.selectedUserToModify = null;

                    this.router.navigate(['/profile']);
                },
                error: () => {
                    this.translate.get('friends.removeError', { name: this.selectedUserToModify?.displayName }).subscribe(msg =>
                        this.snackbar.error(msg)
                    );
                    this.showConfirmModal = false;
                }
            });
        } else {
            this.usersService.sendFriendRequest(this.currentUserId, this.user!.uid).subscribe({
                next: () => {
                    this.translate.get('friends.requestSent', { name: this.user?.displayName }).subscribe(msg =>
                        this.snackbar.success(msg)
                    );
                    this.isFriend = true;
                    this.showConfirmModal = false;
                    this.selectedUserToModify = null;
                },
                error: () => {
                    this.translate.get('friends.requestFailed', { name: this.user?.displayName }).subscribe(msg =>
                        this.snackbar.error(msg)
                    );
                    this.showConfirmModal = false;
                }
            });
        }
    }

    openFriendConfirm(user: ProfileUser, isAlreadyFriend: boolean) {
        this.selectedUserToModify = user;
        this.isFriend = isAlreadyFriend;
        this.showConfirmModal = true;
    }

    get isCurrentUserFriend(): boolean {
        return !!this.user?.friendList?.some(f => f.uid === this.currentUserId);
    }

}
