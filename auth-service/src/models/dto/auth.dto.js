export class CreateUserDTO {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
  }
}

export class LoginDTO {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
  }
}

export class RefreshTokenDTO {
  constructor({ token }) {
    this.token = token;
  }
}
