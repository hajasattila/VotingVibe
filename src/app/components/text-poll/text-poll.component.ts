import {
    Component,
    Input,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit, OnDestroy, AfterViewInit
} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {DatabaseService} from "src/api/services/database-service/database.service";
import {FireworkService} from "../../../api/services/firework-service/firework.service";
import {AuthService} from "../../../api/services/auth-service/auth.service";
import {User} from "@angular/fire/auth";
import {interval, Subscription} from "rxjs";
import {TranslateService} from "@ngx-translate/core";
import {CacheService} from "../../../api/services/cache-service/cache.service";

@Component({
    selector: "app-text-poll",
    templateUrl: "./text-poll.component.html",
    styleUrls: ["./text-poll.component.css"],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TextPollComponent implements OnInit, AfterViewInit, OnDestroy {
    currentUser: User | null = null;
    roomDocId: string | null = null;

    private clickSound = new Audio('https://www.soundjay.com/buttons/sounds/button-4.mp3');

    @Input() question!: string;
    @Input() options!: string[];

    allOptions: string[] = [];
    comparedPairs: Set<string> = new Set();
    leftOption?: string;
    rightOption?: string;
    showWinnerModal = false;
    winnerOption?: string;
    remainingCombinations = 0;
    voteCounts: Record<string, number> = {};
    selectedSide: 'left' | 'right' | null = null;
    animateIncoming: 'left' | 'right' | null = null;
    touchStartX = 0;
    swipeDirection: 'left' | 'right' | null = null;
    showHandHint: boolean = true;
    dragOffsetX: number = 0;
    activeDragSide: 'left' | 'right' | null = null;
    isDragging: boolean = false;
    loading: boolean = true;
    hasAlreadyVoted: boolean = false;
    isResettingVote: boolean = false;
    hasRevoted = false;

    remainingTime = '';
    private timerSubscription?: Subscription;
    private revoteCheckSubscription?: Subscription;

    allPollResults: Record<string, Record<string, number>> = {};

    private imageLoadMonitorInterval?: any;
    private preloadImageUrls: string[] = [];

    loadingLeft: boolean = true;
    loadingRight: boolean = true;


    constructor(
        private dbService: DatabaseService,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef,
        private fireworkService: FireworkService,
        private authService: AuthService,
        private translate: TranslateService,
        private router: Router,
        private cacheService: CacheService,

    ) {
    }

    ngOnInit(): void {
        this.authService.getCurrentUser().subscribe(user => {
            if (user) {
                this.currentUser = user;
            } else {
                const guestId = sessionStorage.getItem('guestId');
                if (guestId) {
                    this.currentUser = {
                        uid: `guest_${guestId}`
                    } as User;
                }
            }
        });

        this.clickSound.load();
        this.fireworkService.initCanvas();

        const roomCode = this.route.snapshot.paramMap.get('code');
        if (roomCode) this.loadPollData(roomCode);
    }


    ngOnDestroy(): void {
        this.timerSubscription?.unsubscribe();
        this.revoteCheckSubscription?.unsubscribe();
        if (this.imageLoadMonitorInterval) {
            clearInterval(this.imageLoadMonitorInterval);
        }
    }


    ngAfterViewInit(): void {
        if (this.preloadImageUrls.length === 0) return;

        this.imageLoadMonitorInterval = setInterval(() => {
            const loaded = this.preloadImageUrls.filter(url => this.cacheService.isImagePreloaded(url));
            const remaining = this.preloadImageUrls.length - loaded.length;

            // console.log(`[📥 Kép cache állapot]: ${loaded.length}/${this.preloadImageUrls.length} betöltve`);
            if (remaining === 0) {
                clearInterval(this.imageLoadMonitorInterval);
            }
        }, 500);
    }

    nextLeftOption?: string;
    nextRightOption?: string;

    loadPollData(roomCode: string): void {
        this.dbService.getRoomByCode(roomCode).subscribe((room) => {
            if (!room?.poll) return;

            this.animateIncomingLeft = false;
            this.animateIncomingRight = false;
            this.animateIncoming = null;
            this.disappearSide = null;
            this.disappearDirection = null;
            this.selectedSide = null;
            this.voteCounts = {};
            this.leftOption = undefined;
            this.rightOption = undefined;
            this.showWinnerModal = false;
            this.comparedPairs.clear();

            this.roomDocId = room.docId ?? null;

            if (!this.currentUser) {
                this.loading = false;
                return;
            }

            const uid = this.currentUser.uid;
            this.allPollResults = room.pollResults ?? {};
            const pollResults = this.allPollResults;

            for (const key of Object.keys(pollResults)) {
                if (key.endsWith('_revote') && pollResults[key] === null) {
                    delete pollResults[key];
                }
            }

            const baseKey = uid;
            const revoteKey = `${uid}_revote`;

            const revoteData = pollResults[revoteKey];
            const baseData = pollResults[baseKey];

            const hasBaseVote = !!baseData;
            const hasRevote = !!revoteData && typeof revoteData === 'object';

            this.hasAlreadyVoted = hasBaseVote || hasRevote;
            this.hasRevoted = hasRevote;

            const userVotes = hasRevote ? revoteData : baseData;

            if (this.hasAlreadyVoted && userVotes) {
                const topOption = Object.entries(userVotes)
                    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0] ?? null;

                if (topOption) {
                    this.winnerOption = topOption;
                    this.showWinnerModal = true;
                    this.voteCounts = userVotes;
                }

                this.loading = false;
                this.cdr.markForCheck();
                return;
            }

            this.question = room.poll.question;
            this.allOptions = [...new Set(room.poll.options)];

            const shuffled = [...this.allOptions].sort(() => 0.5 - Math.random());
            this.leftOption = shuffled[0];
            this.rightOption = shuffled.find(o => o !== this.leftOption);

            this.loadingLeft = this.leftOption?.startsWith('http') ?? false;
            this.loadingRight = this.rightOption?.startsWith('http') ?? false;

            if (this.leftOption && this.rightOption) {
                this.addComparedPair(this.leftOption, this.rightOption);
            }

            this.nextLeftOption = this.rightOption ? this.getUncomparedOptionFor(this.rightOption) : undefined;
            this.nextRightOption = this.leftOption ? this.getUncomparedOptionFor(this.leftOption) : undefined;


            const totalOptions = this.allOptions.length;
            this.remainingCombinations = (totalOptions * (totalOptions - 1)) / 2;

            if (room.endTime?.seconds) {
                const endTime = new Date(room.endTime.seconds * 1000);
                const now = Date.now();
                const diff = endTime.getTime() - now;

                if (diff <= 0) {
                    this.remainingTime = this.translate.instant('room.expired');
                } else {
                    this.remainingTime = this.convertMsToTime(diff);
                    this.startTimer(endTime);
                }
            }

            this.preloadImageUrls = this.allOptions.filter(opt =>
                opt !== this.leftOption &&
                opt !== this.rightOption &&
                opt.startsWith('http')
            );
            setTimeout(() => {
                this.cacheService.preloadImages(this.preloadImageUrls);
            }, 0);

            this.loading = false;
            this.cdr.markForCheck();

            this.revoteCheckSubscription?.unsubscribe();
            this.revoteCheckSubscription = this.dbService.getRoomByCode(roomCode).subscribe(updatedRoom => {
                const updatedResults = updatedRoom?.pollResults ?? {};
                const updatedRevote = updatedResults[revoteKey];

                if (!this.hasRevoted && updatedRevote && typeof updatedRevote === 'object' && updatedRoom?.poll?.options) {
                    this.hasRevoted = true;
                    this.hasAlreadyVoted = true;
                    this.voteCounts = updatedRevote;

                    const topOption = Object.entries(updatedRevote)
                        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0] ?? null;

                    if (topOption) {
                        this.winnerOption = topOption;
                        this.showWinnerModal = true;
                    }

                    this.leftOption = undefined;
                    this.rightOption = undefined;
                    this.cdr.markForCheck();
                }
            });
        });
    }

    startTimer(endTime: Date): void {
        this.timerSubscription?.unsubscribe();
        this.timerSubscription = interval(1000).subscribe(() => {
            const diff = endTime.getTime() - Date.now();
            if (diff <= 0) {
                this.remainingTime = this.translate.instant('room.expired');
                this.timerSubscription?.unsubscribe();
                this.cdr.markForCheck();
            } else {
                this.remainingTime = this.convertMsToTime(diff);
                this.cdr.markForCheck();
            }
        });
    }

    convertMsToTime(ms: number): string {
        const sec = Math.floor((ms / 1000) % 60);
        const min = Math.floor((ms / (1000 * 60)) % 60);
        const hrs = Math.floor((ms / (1000 * 60 * 60)) % 24);
        return `${hrs} h ${min} m ${sec} s`;
    }


    addComparedPair(a: string, b: string): void {
        if (a === b) return;
        const key = this.getPairKey(a, b);
        this.comparedPairs.add(key);
    }

    getPairKey(a: string, b: string): string {
        return [a, b].sort().join('|||');
    }

    getUncomparedOptionFor(selected: string): string | undefined {
        return this.allOptions.find(option => {
            const pairKey = this.getPairKey(selected, option);
            return option !== selected &&
                !this.comparedPairs.has(pairKey) &&
                (!option.startsWith('http') || this.cacheService.isImagePreloaded(option));
        });
    }


    disappearSide: 'left' | 'right' | null = null;
    disappearDirection: 'left' | 'right' | null = null;

    onOptionSelected(option: string, side: 'left' | 'right', event: MouseEvent): void {
        this.showHandHint = false;

        const staticOption = side === 'left' ? this.leftOption : this.rightOption;
        if (!staticOption || option !== staticOption) return;
        if (this.selectedSide) return;

        this.disappearSide = side === 'left' ? 'right' : 'left';
        this.disappearDirection = this.disappearSide === 'left' ? 'left' : 'right';

        this.selectedSide = side;
        this.voteCounts[option] = (this.voteCounts[option] || 0) + 1;

        this.clickSound.volume = 0.05;
        this.clickSound.currentTime = 0;
        this.clickSound.play().catch(err => console.warn('Hanghiba:', err));

        this.fireworkService.trigger(event.clientX, event.clientY);

        const newOption = this.getUncomparedOptionFor(option);

        if (newOption) {
            this.addComparedPair(option, newOption);

            if (side === 'left') {
                this.leftOption = option;
                this.rightOption = newOption;
                this.loadingRight = newOption.startsWith('http');
                this.animateIncoming = 'right';
            } else {
                this.rightOption = option;
                this.leftOption = newOption;
                this.loadingLeft = newOption.startsWith('http');
                this.animateIncoming = 'left';
            }

            setTimeout(() => {
                this.selectedSide = null;
                this.disappearSide = null;
                this.disappearDirection = null;
                this.animateIncoming = null;
                this.cdr.markForCheck();
            }, 400);
        } else {
            this.winnerOption = option;
            this.showWinnerModal = true;

            if (side === 'left') {
                this.leftOption = option;
                this.rightOption = undefined;
            } else {
                this.rightOption = option;
                this.leftOption = undefined;
            }

            this.printTop3Votes();
        }

        this.cdr.markForCheck();
    }

    async printTop3Votes(): Promise<void> {
        if (!this.winnerOption || !this.currentUser || !this.roomDocId) return;

        const baseKey = this.currentUser.uid;
        const finalKey = this.hasAlreadyVoted ? `${baseKey}_revote` : baseKey;

        const completedVoteCounts: Record<string, number> = {};
        this.allOptions.forEach(option => {
            completedVoteCounts[option] = this.voteCounts[option] || 0;
        });

        await this.dbService.savePollResultToRoom(this.roomDocId, {
            [finalKey]: completedVoteCounts
        }, finalKey);


        this.dbService.getRoomByCode(this.route.snapshot.paramMap.get('code')!).subscribe(room => {
            if (room?.pollResults) {
                this.allPollResults = room.pollResults;
            }
        });
    }


    closeWinnerModal(): void {
        this.showWinnerModal = false;
        this.cdr.markForCheck();
    }

    onTouchStart(event: TouchEvent, side: 'left' | 'right') {
        this.showHandHint = false;
        this.touchStartX = event.touches[0].clientX;
        this.activeDragSide = side;
        this.dragOffsetX = 0;
        this.isDragging = true;

        if (this.leftOption) {
            this.nextRightOption = this.getUncomparedOptionFor(this.leftOption);
        }
        if (this.rightOption) {
            this.nextLeftOption = this.getUncomparedOptionFor(this.rightOption);
        }
    }


    onTouchMove(event: TouchEvent) {
        if (!this.isDragging) return;
        const currentX = event.touches[0].clientX;
        this.dragOffsetX = currentX - this.touchStartX;
    }

    animateIncomingLeft: boolean = false;
    animateIncomingRight: boolean = false;

    onTouchEnd(option: string, event: TouchEvent) {
        const touchEndX = event.changedTouches[0].clientX;
        const deltaX = touchEndX - this.touchStartX;

        if (!this.activeDragSide) return;

        const element = document.querySelector(`.option-${this.activeDragSide}`) as HTMLElement;
        const elementWidth = element?.offsetWidth || 0;
        const swipeThreshold = elementWidth / 2;

        const chosenSide = this.activeDragSide === 'left' ? 'right' : 'left';
        const chosenOption = chosenSide === 'left' ? this.leftOption! : this.rightOption!;

        if (Math.abs(deltaX) > swipeThreshold) {
            this.selectedSide = chosenSide;
            this.voteCounts[chosenOption] = (this.voteCounts[chosenOption] || 0) + 1;

            this.clickSound.volume = 0.05;
            this.clickSound.currentTime = 0;
            this.clickSound.play().catch(err => console.warn('Hanghiba:', err));

            if (element) {
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                this.fireworkService.trigger(centerX, centerY);
            }

            const newOption = this.getUncomparedOptionFor(chosenOption);

            if (newOption) {
                this.addComparedPair(chosenOption, newOption);

                const img = new Image();
                img.src = newOption;
                img.onload = () => {
                    if (chosenSide === 'left') {
                        this.leftOption = chosenOption;
                        this.rightOption = newOption;
                        this.loadingRight = false;
                        this.animateIncomingRight = true;
                    } else {
                        this.rightOption = chosenOption;
                        this.leftOption = newOption;
                        this.loadingLeft = false;
                        this.animateIncomingLeft = true;
                    }

                    this.resetSwipeState();
                    this.cdr.markForCheck();

                    setTimeout(() => {
                        this.animateIncomingLeft = false;
                        this.animateIncomingRight = false;
                        this.cdr.markForCheck();
                    }, 400);
                };

                if (newOption.startsWith('http')) {
                    if (chosenSide === 'left') this.loadingRight = true;
                    else this.loadingLeft = true;
                }

            } else {
                this.winnerOption = chosenOption;
                this.showWinnerModal = true;

                if (chosenSide === 'left') {
                    this.leftOption = chosenOption;
                    this.rightOption = undefined;
                } else {
                    this.rightOption = chosenOption;
                    this.leftOption = undefined;
                }

                this.printTop3Votes();
            }

            this.cdr.markForCheck();
        } else {
            this.resetSwipeState();
            this.cdr.markForCheck();
        }
    }

    get dragOpacity(): number {
        const distance = Math.abs(this.dragOffsetX);
        return Math.max(1 - distance / 200, 0.5);
    }

    resetSwipeState(side?: 'left' | 'right'): void {
        if (!side || side === 'left') {
            if (this.activeDragSide === 'left') this.activeDragSide = null;
            this.dragOffsetX = 0;
        }
        if (!side || side === 'right') {
            if (this.activeDragSide === 'right') this.activeDragSide = null;
            this.dragOffsetX = 0;
        }

        if (!side) {
            this.swipeDirection = null;
            this.disappearSide = null;
            this.disappearDirection = null;
            this.selectedSide = null;
            this.isDragging = false;
            setTimeout(() => this.animateIncoming = null, 400);
        }
    }

    resetPollForUser(): void {
        if (!this.currentUser || !this.roomDocId) return;

        this.isResettingVote = true;

        const uid = this.currentUser.uid;
        const keysToRemove = [uid, `${uid}_revote`];

        Promise.all(
            keysToRemove.map(key =>
                this.dbService.removePollResultFromRoom(this.roomDocId!, key)
            )
        )
            .then(() => {
                this.hasRevoted = false;
                this.hasAlreadyVoted = false;
                this.voteCounts = {};
                this.winnerOption = undefined;
                this.showWinnerModal = false;
                this.comparedPairs.clear();
                this.showHandHint = true;
                this.remainingCombinations = 0;
                this.leftOption = undefined;
                this.rightOption = undefined;
                this.selectedSide = null;
                this.animateIncoming = null;
                this.disappearSide = null;
                this.disappearDirection = null;
                this.animateIncomingLeft = false;
                this.animateIncomingRight = false;
                this.dragOffsetX = 0;
                this.activeDragSide = null;
                this.isDragging = false;

                const roomCode = this.route.snapshot.paramMap.get('code');
                if (roomCode) {
                    setTimeout(() => {
                        this.loadPollData(roomCode);
                    });
                }

                this.isResettingVote = false;
                this.cdr.markForCheck();
            })
            .catch(error => {
                console.error('[❌ Hiba a válaszok törlésekor]', error);
                this.isResettingVote = false;
            });
    }


    goHome(): void {
        this.router.navigate(['/home']);
    }
    goToStats(): void {
        const code = this.route.snapshot.paramMap.get('code');
        if (code) this.router.navigate(['/room', code, 'stats']);
    }

}
