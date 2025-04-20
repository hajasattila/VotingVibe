import {Component, OnInit} from '@angular/core';
import {
    AbstractControl,
    NonNullableFormBuilder,
    ValidationErrors,
    ValidatorFn,
    Validators,
} from '@angular/forms';
import {Router} from '@angular/router';
import {switchMap} from 'rxjs/operators';
import {AuthService} from 'src/api/services/auth-service/auth.service';
import {UsersService} from 'src/api/services/users-service/users.service';
import {TranslateService} from '@ngx-translate/core';
import {SnackbarService} from "../../../api/services/snackbar-service/snackbar-service.service";

export function passwordsMatchValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const password = control.get('password')?.value;
        const confirmPassword = control.get('confirmPassword')?.value;

        if (password && confirmPassword && password !== confirmPassword) {
            return {passwordsDontMatch: true};
        } else {
            return null;
        }
    };
}

export function strongPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value;
        if (!value) return null;

        const hasUpperCase = /[A-Z]/.test(value);
        const hasLowerCase = /[a-z]/.test(value);
        const hasDigit = /[0-9]/.test(value);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
        const isValidLength = value.length >= 6;

        const isStrong = hasUpperCase && hasLowerCase && hasDigit && hasSpecialChar && isValidLength;

        return !isStrong ? {weakPassword: true} : null;
    };
}

@Component({
    selector: 'app-sign-up',
    templateUrl: './sign-up.component.html',
    styleUrls: ['./sign-up.component.scss'],
})
export class SignUpComponent implements OnInit {
    signUpForm = this.fb.group(
        {
            name: ['', Validators.required],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, strongPasswordValidator()]],
            confirmPassword: ['', Validators.required],
        },
        {validators: passwordsMatchValidator()}
    );

    constructor(
        private authService: AuthService,
        private router: Router,
        private usersService: UsersService,
        private snackbar: SnackbarService,
        private translate: TranslateService,
        private fb: NonNullableFormBuilder
    ) {
    }

    ngOnInit(): void {
    }

    get email() {
        return this.signUpForm.get('email');
    }

    get password() {
        return this.signUpForm.get('password');
    }

    get confirmPassword() {
        return this.signUpForm.get('confirmPassword');
    }

    get name() {
        return this.signUpForm.get('name');
    }

    submit() {
        const {name, email, password} = this.signUpForm.value;

        if (!this.signUpForm.valid || !name || !password || !email) {
            return;
        }

        this.translate.get('signup.loading').subscribe(loadingMsg => {
            this.snackbar.info(loadingMsg);
        });

        this.authService
            .signUp(email, password)
            .pipe(
                switchMap(({user: {uid}}) =>
                    this.usersService.addUser({uid, email, displayName: name})
                )
            )
            .subscribe({
                next: () => {
                    this.translate.get('signup.success').subscribe(successMsg => {
                        this.snackbar.success(successMsg);
                        this.router.navigate(['/home']);
                    });
                },
                error: (err) => {
                    this.translate.get('signup.error').subscribe(errorMsg => {
                        this.snackbar.error(`${errorMsg}: ${err.message}`);
                    });
                }
            });
    }

    navigateToLogin(event: MouseEvent) {
        event.preventDefault();
        this.router.navigate(['/login']);
    }
}
