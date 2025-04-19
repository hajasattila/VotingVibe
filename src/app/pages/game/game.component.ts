import {Component, OnInit} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {take} from "rxjs";
import {RoomModel} from "src/api/models/room.model";
import {ProfileUser} from "src/api/models/user.model";
import {AuthService} from "src/api/services/auth-service/auth.service";
import {DatabaseService} from "src/api/services/database-service/database.service";
import {UsersService} from "src/api/services/users-service/users.service";
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";
import {TranslateService} from "@ngx-translate/core";

@Component({
    selector: "app-game",
    templateUrl: "./game.component.html",
    styleUrls: ["./game.component.css"],
})
export class GameComponent implements OnInit {
    protected roomCode: string;
    protected currentUser: ProfileUser | null = null;
    protected roomName: string = "";
    protected selectedTimeLimit: number = 1;
    protected selectedVoteType: string = "text";
    protected currentUserId: string | null = null;
    protected isAuthenticated: boolean = false;
    protected friends!: ProfileUser[];
    protected showFriendList = true;
    protected enteredRoomCode: string = "";
    protected isAnonymous: boolean = false;
    protected showRoomForm: boolean = false;
    protected showRoomDetails = false;
    protected showGenerateText = true;
    protected userRooms: RoomModel[] = [];
    protected currentRoom: RoomModel | null = null;
    protected friendListLoaded: boolean = false;


    constructor(
        private snackbarService: SnackbarService, private router: Router,
        private authService: AuthService, private dbService: DatabaseService,
        private userService: UsersService,
        private translate: TranslateService,
        private route: ActivatedRoute,
    ) {
        this.roomCode = this.generateRoomCode(6, 12);
    }


    ngOnInit(): void {
        this.checkAuthAndLoadUser();
        this.loadUserRooms();
        this.loadFriends();

        this.route.queryParams.subscribe(params => {
            const openModal = params['openModal'];
            if (openModal === 'createRoom') {
                this.toggleRoomDetails();
            }
        });
    }

    private checkAuthAndLoadUser(): void {
        this.authService.getCurrentUser().pipe(take(1)).subscribe((user) => {
            if (user) {
                this.isAuthenticated = true;
                this.currentUserId = user.uid;

                this.loadCurrentUserProfile(user.uid);
            } else {
                this.isAuthenticated = false;
                this.currentUserId = null;
            }
        });
    }

    private loadCurrentUserProfile(uid: string): void {
        this.userService.getUserById(uid).pipe(take(1)).subscribe((profileUser) => {
            this.currentUser = profileUser;
        });
    }


    toggleRoomDetails() {
        this.showRoomDetails = !this.showRoomDetails;

        if (this.showRoomDetails) {
            this.showRoomForm = false;
        }

        this.showGenerateText = !this.showRoomDetails;

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {openModal: null},
            queryParamsHandling: 'merge'
        });
    }

    toggleRoomForm() {
        this.showRoomForm = !this.showRoomForm;

        if (this.showRoomForm) {
            this.showRoomDetails = false;
            this.showGenerateText = true;
        }
    }

    toggleFriendList() {
        this.showFriendList = !this.showFriendList;
    }


    private loadUserRooms(): void {
        this.userService.currentUserProfile$.pipe(take(1)).subscribe((user) => {
            if (user?.gameRooms) {
                this.userRooms = user.gameRooms;
            }
        });
    }

    private loadFriends(): void {
        this.friendListLoaded = false;

        this.authService.getCurrentUser().pipe(take(1)).subscribe((user) => {
            if (user) {
                this.userService.getFriends(user.uid).pipe(take(1)).subscribe({
                    next: (friends) => {
                        this.friends = friends;
                        this.friendListLoaded = true;
                    },
                    error: () => {
                        this.friendListLoaded = true;
                    }
                });
            } else {
                this.friendListLoaded = true;
            }
        });
    }


    createRoom(): void {
        if (!this.currentUser) {
            this.translate.get('room.error.loginRequired').subscribe(res => {
                this.snackbarService.error(res);
            });
            return;
        }

        if (!this.roomName) {
            this.translate.get('room.error.roomNameRequired').subscribe(res => {
                this.snackbarService.error(res);
            });
            return;
        }

        const timeLimitInHours = Number(this.selectedTimeLimit);
        let timeLimitInMilliseconds = timeLimitInHours * 3600000;
        let futureTime = Date.now() + timeLimitInMilliseconds;

        const sanitizedUser = this.sanitizeUser(this.currentUser);

        let newRoom: RoomModel = {
            roomId: this.roomCode,
            roomName: this.roomName,
            creator: sanitizedUser,
            members: [sanitizedUser],
            voteType: this.selectedVoteType,
            connectionCode: this.roomCode,
            timeLimit: this.selectedTimeLimit,
            startTime: new Date(),
            endTime: {
                seconds: Math.floor(futureTime / 1000),
                nanoseconds: (futureTime % 1000) * 1000000,
            },
            isAnonymous: this.isAnonymous,
            poll: {
                question: "",
                options: [],
            },
            pollCreated: false,
            createdAt: new Date()
        };
        this.currentRoom = newRoom;

        this.dbService
            .roomIdExists(this.roomCode)
            .pipe(take(1))
            .subscribe((exists: boolean) => {
                if (exists) {
                    this.roomCode = this.generateRoomCode(6, 12);
                    this.translate.get('room.info.newCode', {code: this.roomCode}).subscribe(res => {
                        this.snackbarService.info(res);
                    });
                    newRoom.roomId = this.roomCode;
                    newRoom.connectionCode = this.roomCode;
                }

                this.dbService.createRoom(newRoom).subscribe({
                    next: () => {

                        this.translate.get('room.success.created', {code: this.roomCode}).subscribe(res => {
                            this.snackbarService.success(res);
                        });

                        if (this.currentUser?.uid) {
                            this.userService.addRoomToUser(this.currentUser.uid, newRoom).subscribe({
                                next: () => {
                                    this.translate.get('room.success.addedToProfile').subscribe(res => {
                                        this.snackbarService.success(res);
                                    });
                                },
                                error: (error) => {
                                    this.translate.get('room.error.addToProfile', {error: error.message}).subscribe(res => {
                                        this.snackbarService.error(res);
                                    });
                                    console.error(error)
                                },
                            });
                        }
                        this.router.navigate(["/room", this.roomCode]);
                    },
                    error: (error) => {
                        this.translate.get('room.error.creationFailed', {error: error.message}).subscribe(res => {
                            this.snackbarService.error(res);
                        });
                    }
                });
            });
    }


    joinRoom() {
        if (!this.enteredRoomCode) {
            this.translate.get('room.error.codeRequired').subscribe(res => {
                this.snackbarService.error(res);
            });
            return;
        }

        const guestId = this.getOrCreateGuestId();
        const guestDisplayName = `Vendég#${guestId}`;

        const userToJoin: ProfileUser = this.currentUser ?? this.createGuestUser(`guest_${guestId}`, guestDisplayName);



        const currentUserId = userToJoin.uid;

        this.dbService.getRoomByCode(this.enteredRoomCode).subscribe((room) => {
            if (!room) {
                this.translate.get('room.error.codeNotFound').subscribe(res => {
                    this.snackbarService.error(res);
                });
                return;
            }

            if (!room.docId) {
                this.translate.get('room.error.missingDocId').subscribe(res => {
                    this.snackbarService.error(res);
                });
                return;
            }

            const now = new Date();
            const roomEndTime = new Date(room.endTime.seconds * 1000);

            if (room.endTime && roomEndTime < now) {
                this.translate.get('room.error.expired').subscribe(res => {
                    this.snackbarService.error(res);
                });
                return;
            }

            if (room.members?.some((member) => member.uid === currentUserId)) {
                this.translate.get('room.info.alreadyMember').subscribe(res => {
                    this.snackbarService.info(res);
                });
                this.router.navigate(['/room', this.enteredRoomCode]);
            } else {
                this.dbService.updateRoomMembers(room.docId, userToJoin).subscribe(() => {
                    this.translate.get('room.success.joined').subscribe(res => {
                        this.snackbarService.success(res);
                    });

                    if (this.isAuthenticated && this.currentUser) {
                        this.userService.addRoomToUser(currentUserId, room).subscribe(() => {
                            this.translate.get('room.success.addedToProfile').subscribe(res => {
                                this.snackbarService.success(res);
                            });
                            this.router.navigate(['/room', this.enteredRoomCode]);
                        }, (error) => {
                            this.translate.get('room.error.addToProfile', {error: error.message}).subscribe(res => {
                                this.snackbarService.error(res);
                            });
                        });
                    } else {
                        this.router.navigate(['/room', this.enteredRoomCode]);
                    }

                }, (error) => {
                    this.translate.get('room.error.joinFailed', {error: error.message}).subscribe(res => {
                        this.snackbarService.error(res);
                    });
                });
            }
        });
    }

    private getOrCreateGuestId(): string {
        const existingId = sessionStorage.getItem('guestId');
        if (existingId) return existingId;

        const newId = Math.floor(Math.random() * 100000).toString();
        sessionStorage.setItem('guestId', newId);
        return newId;
    }

    private createGuestUser(uid: string, displayName: string): ProfileUser {
        return {
            uid,
            displayName
        };
    }


    onRoomCodeInput(value: string): void {
        this.enteredRoomCode = value.toUpperCase();
    }


    generateRoomCode(minLength: number, maxLength: number): string {
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    private sanitizeUser(user: ProfileUser): any {
        const sanitized: any = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
        };

        if (user.photoURL) {
            sanitized.photoURL = user.photoURL;
        }

        return sanitized;
    }


}
