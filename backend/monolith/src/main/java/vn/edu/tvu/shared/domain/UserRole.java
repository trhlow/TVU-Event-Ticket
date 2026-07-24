package vn.edu.tvu.shared.domain;

/** The three roles the JWT can carry. Shared so the token's producer and its readers cannot drift. */
public enum UserRole {
    SINH_VIEN,
    ORGANIZER,
    SUPER_ADMIN
}
