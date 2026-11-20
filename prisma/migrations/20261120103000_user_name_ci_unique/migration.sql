-- Nickname uniqueness is case-insensitive (BR-40): a functional unique index on
-- lower(name). Expression indexes cannot be expressed in prisma/schema.prisma,
-- so this is raw SQL; the name itself is stored as entered.
CREATE UNIQUE INDEX "User_lower_name_key" ON "User" (lower("name"));
