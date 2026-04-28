using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    public partial class AddUserBio : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Bio",
                table: "users",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Bio",
                table: "users");
        }
    }
}
