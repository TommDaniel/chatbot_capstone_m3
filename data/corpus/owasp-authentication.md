# OWASP Authentication Cheat Sheet — excertos selecionados

**Fonte e autoria:** OWASP Cheat Sheet Series Team, “Authentication Cheat Sheet”.  
**Fonte Markdown consultada:** https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Authentication_Cheat_Sheet.md  
**Página canônica:** https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html  
**Licença indicada pela série:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/  
**Coleta:** 2026-10-12. **Idioma original:** inglês.

> Este arquivo reproduz, sem tradução, excertos dos títulos indicados abaixo. Foram excluídos navegação, sumário, menus e conteúdo não selecionado. Links e palavras dos trechos consultados foram mantidos. O texto OWASP contém recomendações gerais de segurança e não descreve procedimentos Fluxsus.

## Authentication General Guidelines — User IDs

The primary function of a User ID is to uniquely identify a user within a system. Ideally, User IDs should be randomly generated to prevent the creation of predictable or sequential IDs, which could pose a security risk, especially in systems where User IDs might be exposed or inferred from external sources.

## Authentication General Guidelines — Usernames

Usernames are easy-to-remember identifiers chosen by the user and used for identifying themselves when logging into a system or service. The terms User ID and username might be used interchangeably if the username chosen by the user also serves as their unique identifier within the system.

Users should be permitted to use their email address as a username, provided the email is verified during sign-up. Additionally, they should have the option to choose a username other than an email address. For information on validating email addresses, please visit the [input validation cheat sheet email discussion](Input_Validation_Cheat_Sheet.md#email-address-validation).

## Authentication General Guidelines — Implement Proper Password Strength Controls

A key concern when using passwords for authentication is password strength. A "strong" password policy makes it difficult or even improbable for one to guess the password through either manual or automated means. The following characteristics define a strong password:

- Password Length
    - **Minimum** length for passwords should be enforced by the application.
        - If MFA is enabled passwords **shorter than 8 characters** are considered to be weak ([NIST SP800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)).
        - If MFA is not enabled passwords **shorter than 15 characters** are considered to be weak ([NIST SP800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)).
    - **Maximum** password length should be **at least 64 characters** to allow passphrases ([NIST SP800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordlength)). Note that certain implementations of hashing algorithms may cause [long password denial of service](https://www.acunetix.com/vulnerabilities/web/long-password-denial-of-service/).
    - Longer passphrases are effective because they raise the number of guesses an attacker's dictionary or wordlist has to cover, not because of a precise entropy value: NIST notes that "estimating entropy for user-chosen passwords is challenging" and recommends length and blocklist checks (see below) over composition or entropy math ([NIST SP800-63B, Strength of Passwords](https://pages.nist.gov/800-63-4/sp800-63b/passwords/#appA)).
- Do not silently truncate passwords. The [Password Storage Cheat Sheet](Password_Storage_Cheat_Sheet.md#input-limits-of-bcrypt) provides further guidance on how to handle passwords that are longer than the maximum length.
- Allow usage of **all** characters including unicode and whitespace. There should be no password composition rules limiting the type of characters permitted. There should be no requirement for upper or lower case or numbers or special characters.
- Ensure credential rotation when a password leak occurs, at the time of compromise identification or when authenticator technology changes. Avoid requiring periodic password changes; instead, encourage users to pick strong passwords and enable [Multifactor Authentication Cheat Sheet (MFA)](Multifactor_Authentication_Cheat_Sheet.md). According to NIST guidelines, verifiers should not mandate arbitrary password changes (e.g., periodically).
- Block common and previously breached passwords

## Authentication General Guidelines — Change Password Feature

When developing a change password feature, ensure to have:

- The user is authenticated with an active session.
- Current password verification. This is to ensure that it's the legitimate user who is changing the password. Consider this abuse case: a user logs in on a public computer and forgets to log out. Another person could then use that active session. If we don't verify the current password, this other person may be able to change the password.

## Authentication and Error Messages — Authentication Responses

Using any of the authentication mechanisms (login, password reset, or password recovery), an application must respond with a generic error message regardless of whether:

- The user ID or password was incorrect.
- The account does not exist.
- The account is locked or disabled.

The account registration feature should also be taken into consideration, and the same approach of a generic error message can be applied regarding the case in which the user exists. The objective is to prevent the creation of a [discrepancy factor](https://cwe.mitre.org/data/definitions/204.html), allowing an attacker to mount a user enumeration action against the application.

## Logging and Monitoring

Enable logging and monitoring of authentication functions to detect attacks/failures on a real-time basis

- Ensure that all failures are logged and reviewed
- Ensure that all password failures are logged and reviewed
- Ensure that all account lockouts are logged and reviewed
