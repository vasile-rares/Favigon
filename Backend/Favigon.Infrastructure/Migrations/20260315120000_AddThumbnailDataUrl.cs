using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    public partial class AddThumbnailDataUrl : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ThumbnailDataUrl",
                table: "projects",
                type: "text",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ThumbnailDataUrl",
                table: "projects");
        }
    }
}
