import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, UrlTree, Router } from "@angular/router";
import { AuthService } from "../auth-service/auth.service";
import { DatabaseService } from "../database-service/database.service";
import { take } from "rxjs/operators";

@Injectable({
    providedIn: "root",
})
export class RoomMemberGuard {
    constructor(
        private authService: AuthService,
        private dbService: DatabaseService,
        private router: Router
    ) {}

    async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
        const roomCode = route.paramMap.get("code");

        if (!roomCode) {
            return this.router.parseUrl("/notfound");
        }

        try {
            const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();
            const guestId = sessionStorage.getItem('guestId');
            const currentUid = currentUser?.uid ?? (guestId ? `guest_${guestId}` : null);

            if (!currentUid) {
                return this.router.parseUrl("/login");
            }

            const room = await this.dbService.getRoomByCode(roomCode).pipe(take(1)).toPromise();

            if (!room) {
                return this.router.parseUrl("/notfound");
            }

            const isMember = (room.members || []).some(member => member.uid === currentUid);

            return isMember ? true : this.router.parseUrl("/notfound");

        } catch (error) {
            return this.router.parseUrl("/notfound");
        }
    }
}
