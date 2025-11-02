# Contributing to SPL Token Distribution DApp

Thank you for your interest in contributing to the SPL Token Distribution DApp! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## 🤝 Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors. By participating, you agree to:

- Be respectful and inclusive
- Focus on constructive feedback
- Accept responsibility for mistakes
- Show empathy towards other contributors
- Help create a positive community

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm/yarn
- **Rust** and Cargo (for smart contract development)
- **Solana CLI tools**
- **Anchor framework**
- **Git**

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/spl-token-distribution.git
   cd spl-token-distribution
   ```

2. **Install dependencies**
   ```bash
   # Backend dependencies (Rust/Anchor)
   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
   avm install latest
   avm use latest

   # Frontend dependencies
   cd app
   npm install
   ```

3. **Set up local development environment**
   ```bash
   # Start local Solana validator
   solana-test-validator

   # In another terminal, build and deploy the program
   anchor build
   anchor deploy

   # Start the frontend development server
   cd app
   npm run dev
   ```

4. **Verify setup**
   - Open http://localhost:5173
   - Connect a Solana wallet
   - Test basic functionality

## 🔄 Development Workflow

### Branching Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical production fixes

### Commit Convention

We follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing related changes
- `chore`: Maintenance tasks

Examples:
```
feat(claim): add cooldown timer display
fix(admin): resolve claimer removal bug
docs(readme): update deployment instructions
```

## 📏 Code Standards

### Rust/Solana (Backend)

- Follow the [official Rust style guide](https://doc.rust-lang.org/1.0.0/style/README.html)
- Use `rustfmt` for code formatting
- Run `cargo clippy` for linting
- Document all public functions with Rustdoc comments
- Use meaningful variable names
- Handle errors properly with `Result` types

### TypeScript/React (Frontend)

- Use TypeScript for all new code
- Follow ESLint configuration
- Use functional components with hooks
- Document components and functions with JSDoc comments
- Use meaningful variable and function names
- Handle errors gracefully
- Write accessible components

### General Guidelines

- Write self-documenting code
- Keep functions small and focused
- Use consistent naming conventions
- Add comments for complex logic
- Test your changes thoroughly

## 🧪 Testing

### Backend Testing

```bash
# Run all tests
anchor test

# Run with verbose output
anchor test --verbose

# Run specific test
anchor test -- --grep "test_name"
```

### Frontend Testing

Currently manual testing is primary. Future enhancements will include:

- Unit tests with Jest
- Component tests with React Testing Library
- E2E tests with Playwright

### Testing Checklist

Before submitting changes, ensure:

- [ ] All existing tests pass
- [ ] New functionality is tested
- [ ] Edge cases are covered
- [ ] Manual testing completed
- [ ] No console errors or warnings
- [ ] Responsive design verified

## 📝 Submitting Changes

### Pull Request Process

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow code standards
   - Add tests for new functionality
   - Update documentation
   - Ensure all tests pass

3. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request**
   - Use a descriptive title
   - Provide detailed description
   - Reference related issues
   - Request review from maintainers

### PR Requirements

- [ ] Code follows project standards
- [ ] Tests pass and are included
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] Descriptive commit messages
- [ ] Related issues referenced

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Description**: Clear description of the issue
- **Steps to reproduce**: Step-by-step instructions
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, browser, wallet, etc.
- **Screenshots**: If applicable
- **Console logs**: Browser/Solana logs

### Feature Requests

For feature requests, please include:

- **Description**: What feature you'd like
- **Use case**: Why it's needed
- **Implementation ideas**: How it could work
- **Alternatives**: Other solutions considered

### Security Issues

For security-related issues:

- **DO NOT** create public GitHub issues
- Email maintainers directly
- Provide detailed information
- Allow time for responsible disclosure

## 📚 Additional Resources

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework Docs](https://www.anchor-lang.com/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🙏 Recognition

Contributors will be recognized in:
- Repository README
- Release notes
- Project documentation

Thank you for contributing to the SPL Token Distribution DApp! 🎉