# GameBuddyWebsite


GameBuddy to serwis społecznościowy dla graczy, który pozwala na szukanie partnerów do gry i komunikację.
Aplikacja opiera się na bezpośrednim połączeniu z bazą danych w chmurze (Supabase).


1. System Użytkownika i Bezpieczeństwo

    Rejestracja i Profil: Użytkownik zakłada konto podając email, hasło oraz unikalny nick (system sprawdza, czy nick jest wolny).
    Po rejestracji automatycznie tworzony jest profil gracza.

    Logowanie i Blokady: System logowania przy każdym odświeżeniu strony sprawdza status konta.
    Jeśli użytkownik został zbanowany przez administratora, zostanie automatycznie wylogowany i wyrzucony ze strony.

    Wyszukiwanie: Dostępna jest wyszukiwarka (find.html), która pozwala znaleźć innych graczy po fragmencie ich nicku,
    wyświetlając ich email i typ konta.

2. Tablica Ogłoszeń (Posts)

    Publikacja: Zalogowani użytkownicy mogą dodawać ogłoszenia ("szukam ekipy"), podając tytuł, treść i tagi (typy gier).

    Przeglądanie: Strona główna z postami wyświetla listę najnowszych ogłoszeń wraz z autorem (nickiem) i datą dodania.

    Zarządzanie: Interfejs przewiduje przycisk usuwania postów (dla autora oraz administratora).

3. Komunikacja (Wiadomości)

    Aplikacja posiada interfejs (contact.html) do prywatnej korespondencji.

    Użytkownicy mogą wysyłać wiadomości do konkretnego nicku oraz przeglądać swoją skrzynkę odbiorczą 

4. Panel Administratora (Moderacja)

    Użytkownik z uprawnieniami is_admin ma dostęp do ukrytego panelu (admin.html), który daje pełną kontrolę nad serwisem:

    Zarządzanie Użytkownikami: Podgląd listy wszystkich zarejestrowanych, możliwość ich banowania/odbanowywania oraz całkowitego usuwania kont.

    Moderacja Treści: Możliwość przeglądania i usuwania dowolnego ogłoszenia na stronie.

    Inwigilacja Wiadomości: Administrator ma wgląd w listę wszystkich prywatnych wiadomości przesyłanych między użytkownikami i może je usuwać.
