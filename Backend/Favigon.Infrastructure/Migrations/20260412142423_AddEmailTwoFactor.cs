using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    public partial class AddEmailTwoFactor : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsTwoFactorEnabled",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "two_factor_code_expires_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "two_factor_code_hash",
                table: "users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "two_factor_code_purpose",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsTwoFactorEnabled",
                table: "users");

            migrationBuilder.DropColumn(
                name: "two_factor_code_expires_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "two_factor_code_hash",
                table: "users");

            migrationBuilder.DropColumn(
                name: "two_factor_code_purpose",
                table: "users");
        }
    }
}
