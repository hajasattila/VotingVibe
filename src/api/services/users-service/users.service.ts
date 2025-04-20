import {Injectable} from "@angular/core";
import {
    collection,
    doc,
    docData,
    Firestore,
    getDoc,
    setDoc,
    updateDoc,
    collectionData,
    arrayUnion,
    arrayRemove, onSnapshot
} from "@angular/fire/firestore";
import {catchError, from, map, Observable, of, shareReplay, switchMap, tap, throwError} from "rxjs";
import {ProfileUser} from "../../models/user.model";
import {AuthService} from "../auth-service/auth.service";
import {runTransaction} from "firebase/firestore";
import {RoomModel} from "../../models/room.model";
import {startWith} from "rxjs/operators";
import {RoomInvite} from "../../models/roomInvitation.model";

@Injectable({
    providedIn: "root",
})
export class UsersService {


    constructor(private firestore: Firestore, private authService: AuthService) {
    }

    getFriends(userId: string): Observable<ProfileUser[]> {
        const friendsRef = collection(this.firestore, `/users/${userId}/friendList`);
        return collectionData(friendsRef, {idField: "key"}).pipe(
            map((friends: any[]) =>
                friends.map((friend) => ({
                    ...(friend as ProfileUser),
                }))
            )
        );
    }

    private loadCachedUserProfile(): ProfileUser | null {
        const cached = localStorage.getItem('currentUserProfile');
        return cached ? JSON.parse(cached) : null;
    }


    get currentUserProfile$(): Observable<ProfileUser | null> {
        const cachedProfile = this.loadCachedUserProfile();

        return this.authService.currentUser$.pipe(
            switchMap((user) => {
                if (!user?.uid) {
                    return of(null);
                }
                const ref = doc(this.firestore, "users", user.uid);
                return docData(ref) as Observable<ProfileUser>;
            }),
            tap((profile) => {
                if (profile) {
                    localStorage.setItem('currentUserProfile', JSON.stringify(profile));
                }
            }),
            startWith(cachedProfile),
            shareReplay(1)
        );
    }

    addUser(user: ProfileUser): Observable<void> {
        const ref = doc(this.firestore, "users", user.uid);
        return from(setDoc(ref, user));
    }

    updateUser(user: ProfileUser): Observable<void> {
        const userRef = doc(this.firestore, "users", user.uid);
        return from(updateDoc(userRef, {...user}));
    }

    getFilteredUsers(query: string): Observable<ProfileUser[]> {
        const usersRef = collection(this.firestore, "users");
        return collectionData(usersRef, {idField: "uid"}).pipe(
            map((users: any[]) =>
                users.map(
                    (user: any) =>
                        ({
                            uid: user.uid,
                            email: user.email,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            displayName: user.displayName,
                            phone: user.phone,
                            address: user.address,
                            photoURL: user.photoURL,
                            description: user.description,
                            friendList: user.friendList,
                            games: user.games,
                            polls: user.polls,
                        } as ProfileUser)
                )
            ),
            map((users: ProfileUser[]) => users.filter((user) => user.displayName?.toLowerCase().includes(query.toLowerCase())))
        );
    }

    sendFriendRequest(currentUserId: string, friendId: string): Observable<any> {
        return this.authService.currentUser$.pipe(
            switchMap((currentUser) => {
                if (!currentUser?.uid) {
                    throw new Error("You must be logged in to send friend requests.");
                }
                const friendUserRef = doc(this.firestore, "users", friendId);
                return from(getDoc(friendUserRef)).pipe(
                    switchMap((friendDoc) => {
                        const friendData = friendDoc.data() as ProfileUser;

                        if (friendData?.friendList?.some((friend: any) => friend.uid === currentUserId)) {
                            return throwError(() => new Error("Users are already friends"));
                        } else {
                            return from(
                                updateDoc(friendUserRef, {
                                    friendRequests: arrayUnion(currentUserId),
                                })
                            );
                        }
                    }),
                    catchError((error) => {
                        return throwError(() => error);
                    })
                );
            })
        );
    }

    acceptFriendRequest(currentUserId: string, requestingUserId: string): Observable<void> {
        const currentUserDocRef = doc(this.firestore, `users/${currentUserId}`);
        const requestingUserDocRef = doc(this.firestore, `users/${requestingUserId}`);
        return from(
            runTransaction(this.firestore, async (transaction) => {
                const requestingUserDoc = await transaction.get(requestingUserDocRef);
                const currentUserDoc = await transaction.get(currentUserDocRef);

                if (requestingUserDoc.exists() && currentUserDoc.exists()) {
                    const requestingUser = requestingUserDoc.data();
                    const currentUser = currentUserDoc.data();
                    transaction.update(currentUserDocRef, {
                        friendList: arrayUnion({uid: requestingUserId, displayName: requestingUser["displayName"]}),
                        friendRequests: arrayRemove(requestingUserId),
                    });
                    transaction.update(requestingUserDocRef, {
                        friendList: arrayUnion({uid: currentUserId, displayName: currentUser["displayName"]}),
                    });
                } else {
                    console.error("One or both users not found");
                }
            })
        );
    }

    getUserById(uid: string): Observable<ProfileUser> {
        const userDocRef = doc(this.firestore, `users/${uid}`);
        return docData(userDocRef) as Observable<ProfileUser>;
    }

    hasAlreadySentRequest(currentUserId: string, potentialFriendId: string): Observable<boolean> {
        return this.getUserById(currentUserId).pipe(map((user) => user?.sentFriendRequests?.includes(potentialFriendId) || false));
    }

    rejectFriendRequest(currentUserId: string, requestingUserId: string): Observable<void> {
        const currentUserDocRef = doc(this.firestore, `users/${currentUserId}`);
        return from(
            updateDoc(currentUserDocRef, {
                friendRequests: arrayRemove(requestingUserId),
            })
        );
    }

    removeFriend(friend: ProfileUser): Observable<void> {
        return this.authService.currentUser$.pipe(
            switchMap((currentUser) => {
                if (!currentUser || !currentUser.uid) {
                    return throwError(() => new Error("You must be logged in to remove friends."));
                }

                const currentUserDocRef = doc(this.firestore, `users/${currentUser.uid}`);
                const friendDocRef = doc(this.firestore, `users/${friend.uid}`);

                return from(
                    runTransaction(this.firestore, async (transaction) => {
                        const currentUserDoc = await transaction.get(currentUserDocRef);
                        const friendDoc = await transaction.get(friendDocRef);

                        if (!currentUserDoc.exists() || !friendDoc.exists()) {
                            throw new Error("One of the user profiles does not exist.");
                        }

                        const currentUserData = currentUserDoc.data();
                        const friendObject = { uid: friend.uid, displayName: friend.displayName };
                        const currentUserObject = { uid: currentUser.uid, displayName: currentUserData["displayName"] };

                        transaction.update(currentUserDocRef, {
                            friendList: arrayRemove(friendObject),
                        });

                        transaction.update(friendDocRef, {
                            friendList: arrayRemove(currentUserObject),
                        });
                    })
                );
            }),
            catchError((error) => {
                console.error("Error removing friend:", error);
                return throwError(() => error);
            })
        );
    }

    isDisplayNameTaken(displayName: string, currentUserId: string): Observable<boolean> {
        return this.getFilteredUsers(displayName).pipe(map((users) => users.some((user) => user.uid !== currentUserId && user.displayName?.toLowerCase() === displayName.toLowerCase())));
    }

    addRoomToUser(userId: string | null, room: RoomModel): Observable<void> {
        if (!userId) {
            console.error("Invalid user ID");
            return throwError(() => new Error("Invalid user ID"));
        }
        const userDocRef = doc(this.firestore, `users/${userId}`);
        return from(
            updateDoc(userDocRef, {
                gameRooms: arrayUnion(room),
            })
        );
    }

    //TODO: maybe future developments for bidirectional friend remove.

    // removeFriendBidirectional(
    //     currentUserId: string,
    //     friendUid: string,
    // ): Observable<void> {
    //     const currentUserRef = doc(this.firestore, `users/${currentUserId}`);
    //     const friendUserRef = doc(this.firestore, `users/${friendUid}`);
    //
    //     return from(
    //         runTransaction(this.firestore, async (transaction) => {
    //             const currentUserDoc = await transaction.get(currentUserRef);
    //             const friendUserDoc = await transaction.get(friendUserRef);
    //
    //             if (!currentUserDoc.exists() || !friendUserDoc.exists()) {
    //                 throw new Error("One of the user profiles does not exist.");
    //             }
    //
    //             const currentFriendList = currentUserDoc.data()?.['friendList'] || [];
    //             const friendFriendList = friendUserDoc.data()?.['friendList'] || [];
    //
    //             const updatedCurrentList = currentFriendList.filter((f: any) => f.uid !== friendUid);
    //             const updatedFriendList = friendFriendList.filter((f: any) => f.uid !== currentUserId);
    //
    //             transaction.update(currentUserRef, {
    //                 friendList: updatedCurrentList,
    //             });
    //
    //             transaction.update(friendUserRef, {
    //                 friendList: updatedFriendList,
    //             });
    //         })
    //     );
    // }

    inviteUserToRoom(friendUid: string, roomId: string, inviter: ProfileUser, roomName: string): Observable<any> {
        const payload: RoomInvite = {
            roomId,
            inviterUid: inviter.uid,
            inviterName: inviter.displayName,
            roomName,
            sentAt: new Date(),
            status: 'pending',
        };



        return from(
            setDoc(doc(this.firestore, `users/${friendUid}/roomInvites/${roomId}`), payload)
        );
    }

    getRoomInvites(userId: string): Observable<RoomInvite[]> {
        const invitesRef = collection(this.firestore, `users/${userId}/roomInvites`);
        return collectionData(invitesRef, {idField: 'roomId'}) as Observable<RoomInvite[]>;
    }


    updateInviteStatus(userId: string, roomId: string, status: 'accepted' | 'rejected'): Observable<void> {
        const inviteDocRef = doc(this.firestore, `users/${userId}/roomInvites/${roomId}`);
        return from(updateDoc(inviteDocRef, {status}));
    }

    getFriendsLive(uid: string): Observable<ProfileUser[]> {
        return new Observable(observer => {
            const sub = onSnapshot(doc(this.firestore, 'users', uid), (docSnap) => {
                const user = docSnap.data() as ProfileUser;
                const friends = user?.friendList || [];
                observer.next(friends);
            });

            return () => sub();
        });
    }

    getLatestUsers(limitCount: number = 5): Observable<ProfileUser[]> {
        const usersRef = collection(this.firestore, "users");
        return collectionData(usersRef, {idField: "uid"}).pipe(
            map((users: any[]) =>
                users
                    .map((user: any) => ({
                        uid: user.uid,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        displayName: user.displayName,
                        phone: user.phone,
                        address: user.address,
                        photoURL: user.photoURL,
                        description: user.description,
                        friendList: user.friendList,
                        games: user.games,
                        polls: user.polls,
                    } as ProfileUser))
                    .slice(0, limitCount)
            )
        );
    }


    getUsersNotInFriendList(userId: string): Observable<ProfileUser[]> {
        return this.getFriends(userId).pipe(
            switchMap(friends => {
                const friendUids = friends.map(f => f.uid);
                return collectionData(collection(this.firestore, 'users'), { idField: 'uid' }).pipe(
                    map((users: any[]) =>
                        users
                            .map((user: any) => ({
                                uid: user.uid,
                                email: user.email,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                displayName: user.displayName,
                                phone: user.phone,
                                address: user.address,
                                photoURL: user.photoURL,
                                description: user.description,
                                friendList: user.friendList,
                                games: user.games,
                                polls: user.polls,
                            } as ProfileUser))
                            .filter(u => u.uid !== userId && !friendUids.includes(u.uid))
                    )
                );
            })
        );
    }



}
