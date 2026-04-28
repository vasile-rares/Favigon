using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    public partial class RemoveProjectType : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Type",
                table: "Projects");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Projects",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }
    }
}
