# Comment Authoring - Sources and Attribution

The SKILL.md body states the house rules directly: comments say what code cannot, capped at ~3 lines, no incident narratives. Those are stricter than the general industry guidance below and win on any conflict - most sources here would accept a longer paragraph-style comment (e.g. Jane Street's own worked examples run 5-6 lines) where this skill caps at 3.

## Example attribution

- **Timeout-units example** (non-obvious constraint + warning), adapted from Google Testing Blog, [Code Health: To Comment or Not to Comment?](https://testing.googleblog.com/2017/07/code-health-to-comment-or-not-to-comment.html) - compressed from the source's 3-line prose form to fit the 3-line ceiling.
- **`n = best_node` rename example**, from [Stack Overflow Blog: Best Practices for Writing Code Comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/).
- **Module-level "Array of tuples" example**, from Jane Street, [10 Tips for Writing Comments (Plus One More)](https://blog.janestreet.com/10-tips-for-writing-comments-plus-one-more/) - originally about an OCaml module; the principle (one high-level comment eliminates dozens of line comments) is language-agnostic.
- **Performance-hack one-clause example**, adapted from the same Jane Street post's "disimprovements that look like bugs" principle; the source's version is a full sentence, compressed here to a single clause per the house rule.
- **Bug-fix comment example**, original to this skill, illustrating the house rule that the incident (date, ticket, node ID) belongs in the commit message, not the source.

## Full source list

- [Google Testing Blog: Code Health: To Comment or Not to Comment?](https://testing.googleblog.com/2017/07/code-health-to-comment-or-not-to-comment.html)
- [Google Eng Practices: What to Look for in a Code Review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [Google Style Guide: Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html)
- [Jane Street Blog: 10 Tips for Writing Comments (Plus One More)](https://blog.janestreet.com/10-tips-for-writing-comments-plus-one-more/)
- [Kevlin Henney, ACCU Overload: Comment Only What The Code Cannot Say](https://accu.org/journals/overload/28/157/henney_2796/)
- [Robert C. Martin (Uncle Bob), Clean Code Blog: Necessary Comments](https://blog.cleancoder.com/uncle-bob/2017/02/23/NecessaryComments.html)
- [Clean Code Tip of the Week #5: Avoid Redundant Comments (InformIT)](https://www.informit.com/articles/article.aspx?p=1327761)
- [Clean Code Tip of the Week #4: Avoid Obsolete Comments (InformIT)](https://www.informit.com/articles/article.aspx?p=1326509)
- [The Craftsman C1: Inappropriate Information (Object Mentor)](https://objectmentor.com/resources/articles/The_Craftsman_52.htm)
- [Stack Overflow Blog: Best Practices for Writing Code Comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/)
- [Ruthlessly Helpful: Rules for Commenting Code (Tim Ottinger)](https://ruthlesslyhelpful.net/2012/02/25/rules-for-commenting-code/)
- [The Pragmatic Programmer: It's All Writing (Comments in Code)](https://flylib.com/books/en/1.315.1.73/1/)
- [StepSize: The Engineer's Guide to Writing Meaningful Code Comments](https://stepsize.com/blog/the-engineers-guide-to-writing-code-comments)
- [TypeScript Lang: JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [Microsoft FluidFramework Wiki: TSDoc Guidelines](https://github.com/microsoft/FluidFramework/wiki/TSDoc-Guidelines)
