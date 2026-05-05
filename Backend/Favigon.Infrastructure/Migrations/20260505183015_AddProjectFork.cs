using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectFork : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ForkedFromProjectId",
                table: "projects",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_projects_ForkedFromProjectId",
                table: "projects",
                column: "ForkedFromProjectId");

            migrationBuilder.AddForeignKey(
                name: "FK_projects_projects_ForkedFromProjectId",
                table: "projects",
                column: "ForkedFromProjectId",
                principalTable: "projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_projects_projects_ForkedFromProjectId",
                table: "projects");

            migrationBuilder.DropIndex(
                name: "IX_projects_ForkedFromProjectId",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "ForkedFromProjectId",
                table: "projects");
        }
    }
}
