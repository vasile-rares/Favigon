using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Prismatic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RefactorPasswordResetAndLinkedAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_account_providers_users_UserId",
                table: "account_providers");

            migrationBuilder.DropTable(
                name: "password_reset_tokens");

            migrationBuilder.DropPrimaryKey(
                name: "PK_account_providers",
                table: "account_providers");

            migrationBuilder.RenameTable(
                name: "account_providers",
                newName: "linked_accounts");

            migrationBuilder.RenameIndex(
                name: "IX_account_providers_UserId_Provider",
                table: "linked_accounts",
                newName: "IX_linked_accounts_UserId_Provider");

            migrationBuilder.RenameIndex(
                name: "IX_account_providers_Provider_ProviderUserId",
                table: "linked_accounts",
                newName: "IX_linked_accounts_Provider_ProviderUserId");

            migrationBuilder.AddColumn<DateTime>(
                name: "password_reset_expires_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "password_reset_token_hash",
                table: "users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_linked_accounts",
                table: "linked_accounts",
                column: "Id");

            migrationBuilder.CreateIndex(
                name: "IX_users_password_reset_token_hash",
                table: "users",
                column: "password_reset_token_hash",
                unique: true,
                filter: "password_reset_token_hash IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_linked_accounts_users_UserId",
                table: "linked_accounts",
                column: "UserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_linked_accounts_users_UserId",
                table: "linked_accounts");

            migrationBuilder.DropIndex(
                name: "IX_users_password_reset_token_hash",
                table: "users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_linked_accounts",
                table: "linked_accounts");

            migrationBuilder.DropColumn(
                name: "password_reset_expires_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "password_reset_token_hash",
                table: "users");

            migrationBuilder.RenameTable(
                name: "linked_accounts",
                newName: "account_providers");

            migrationBuilder.RenameIndex(
                name: "IX_linked_accounts_UserId_Provider",
                table: "account_providers",
                newName: "IX_account_providers_UserId_Provider");

            migrationBuilder.RenameIndex(
                name: "IX_linked_accounts_Provider_ProviderUserId",
                table: "account_providers",
                newName: "IX_account_providers_Provider_ProviderUserId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_account_providers",
                table: "account_providers",
                column: "Id");

            migrationBuilder.CreateTable(
                name: "password_reset_tokens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_password_reset_tokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_password_reset_tokens_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_password_reset_tokens_TokenHash",
                table: "password_reset_tokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_password_reset_tokens_UserId",
                table: "password_reset_tokens",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_account_providers_users_UserId",
                table: "account_providers",
                column: "UserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
