import { GitHubRepository } from '../types/github';

export class RepositoryModel implements GitHubRepository {
  public id: number;
  public name: string;
  public full_name: string;
  public owner: {
    login: string;
    avatar_url: string;
  };
  public private: boolean;
  public html_url: string;
  public description: string | null;
  public default_branch: string;

  constructor(repo: GitHubRepository) {
    this.id = repo.id;
    this.name = repo.name;
    this.full_name = repo.full_name;
    this.owner = repo.owner;
    this.private = repo.private;
    this.html_url = repo.html_url;
    this.description = repo.description;
    this.default_branch = repo.default_branch || 'main';
  }

  public getOwnerLogin(): string {
    return this.owner.login;
  }

  public getFormattedName(): string {
    return `${this.owner.login}/${this.name}`;
  }

  public toRawGitHubRepo(): GitHubRepository {
    return {
      id: this.id,
      name: this.name,
      full_name: this.full_name,
      owner: this.owner,
      private: this.private,
      html_url: this.html_url,
      description: this.description,
      default_branch: this.default_branch,
    };
  }
}
