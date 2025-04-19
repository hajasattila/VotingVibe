import {
    Firestore,
    arrayUnion,
    collection,
    doc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where,
    DocumentReference, onSnapshot
} from "@angular/fire/firestore";
import {BehaviorSubject, Observable, from, map, switchMap} from "rxjs";
import {RoomModel, textPollModel} from "../../models/room.model";
import {ProfileUser} from "../../models/user.model";
import {inject, Injectable} from '@angular/core';
import {Storage, ref, uploadBytes, getDownloadURL} from '@angular/fire/storage';



@Injectable({
    providedIn: "root",
})
export class DatabaseService {
    private storage: Storage = inject(Storage);

    constructor(private firestore: Firestore
    ) {
    }

    createRoom(room: RoomModel): Observable<void> {
        const roomRef = doc(collection(this.firestore, "rooms"));
        return from(setDoc(roomRef, room));
    }

    roomIdExists(roomId: string): Observable<boolean> {
        const roomsRef = collection(this.firestore, "rooms");
        const q = query(roomsRef, where("roomId", "==", roomId));

        return from(getDocs(q)).pipe(
            map((snapshot) => snapshot.docs.length > 0)
        );
    }

    getRoomByCode(code: string): Observable<RoomModel | null> {
        const roomsRef = collection(this.firestore, "rooms");
        const q = query(roomsRef, where("connectionCode", "==", code));
        return from(getDocs(q)).pipe(
            map((snapshot) => {
                if (snapshot.docs.length > 0) {
                    const roomData = snapshot.docs[0].data() as RoomModel;
                    const docId = snapshot.docs[0].id;
                    return {...roomData, docId};
                }
                return null;
            })
        );
    }

    getRoomDocRefByCode(code: string): Observable<DocumentReference> {
        const roomsRef = collection(this.firestore, "rooms");
        const q = query(roomsRef, where("connectionCode", "==", code));

        return from(getDocs(q)).pipe(
            map(snapshot => {
                if (snapshot.empty) {
                    throw new Error("RoomModel not found with given code.");
                }
                return snapshot.docs[0].ref;
            })
        );
    }

    updateRoomMembers(docId: string, newMember: ProfileUser): Observable<void> {
        const roomRef = doc(this.firestore, "rooms", docId);
        return from(
            updateDoc(roomRef, {
                members: arrayUnion(newMember),
            })
        );
    }

    addPollToRoom(docId: string, poll: textPollModel): Observable<void> {
        const roomRef = doc(this.firestore, "rooms", docId);
        return from(updateDoc(roomRef, {poll}));
    }

    updateRoomPollState(docId: string, pollCreated: boolean): Observable<void> {
        const roomRef = doc(this.firestore, "rooms", docId);
        return from(updateDoc(roomRef, {pollCreated}));
    }

    async savePollResultToRoom(roomDocId: string, result: Record<string, Record<string, number>>, userUid: string): Promise<void> {
        const roomRef = doc(this.firestore, 'rooms', roomDocId);
        const userVotes = Object.values(result)[0];

        await updateDoc(roomRef, {
            [`pollResults.${userUid}`]: userVotes
        });
    }


    async removePollResultFromRoom(roomDocId: string, userKey: string): Promise<void> {
        const roomRef = doc(this.firestore, 'rooms', roomDocId);
        const dataToUpdate: any = {};
        dataToUpdate[`pollResults.${userKey}_revote`] = null;
        dataToUpdate[`pollResults.${userKey}`] = null;
        await updateDoc(roomRef, dataToUpdate);
    }


    addUserToRoomByCode(code: string, user: ProfileUser): Observable<void> {
        return this.getRoomDocRefByCode(code).pipe(
            switchMap((roomRef) => from(updateDoc(roomRef, {
                members: arrayUnion(user)
            })))
        );
    }

    getRoomsForUser(userUid: string): Observable<(RoomModel & { isCreator: boolean })[]> {
        const roomsRef = collection(this.firestore, 'rooms');
        const q = query(roomsRef);

        return from(getDocs(q)).pipe(
            map(snapshot => {
                return snapshot.docs
                    .map(doc => {
                        const room = doc.data() as RoomModel;
                        const isMember = room.members?.some(member => member.uid === userUid);
                        const isCreator = room.creator?.uid === userUid;

                        if (isMember) {
                            return {
                                ...room,
                                docId: doc.id,
                                isCreator
                            } as RoomModel & { isCreator: boolean };
                        }

                        return null;
                    })
                    .filter((room): room is RoomModel & { isCreator: boolean } => room !== null);
            })
        );
    }

    watchRoomByCode(code: string): Observable<RoomModel | null> {
        const roomsRef = collection(this.firestore, "rooms");
        const q = query(roomsRef, where("connectionCode", "==", code));

        return new Observable<RoomModel | null>((observer) => {
            const unsubscribe = onSnapshot(q, (snapshot) => {
                if (snapshot.empty) {
                    observer.next(null);
                    return;
                }

                const roomData = snapshot.docs[0].data() as RoomModel;
                const docId = snapshot.docs[0].id;
                observer.next({...roomData, docId});
            }, error => {
                observer.error(error);
            });

            return () => unsubscribe();
        });
    }
    uploadPollImage(roomId: string, file: File, filename: string): Promise<string> {
        const path = `rooms/${roomId}/poll/${filename}`;
        const storageRef = ref(this.storage, path);
        return uploadBytes(storageRef, file).then(() => getDownloadURL(storageRef));
    }

}