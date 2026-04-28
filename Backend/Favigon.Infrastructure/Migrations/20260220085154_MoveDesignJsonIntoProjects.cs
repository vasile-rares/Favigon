using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    public partial class MoveDesignJsonIntoProjects : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DesignJson",
                table: "Projects",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.Sql(@"
                UPDATE ""Projects"" p
                SET ""DesignJson"" = d.""DesignJson""
                FROM ""ProjectDesigns"" d
                WHERE d.""ProjectId"" = p.""Id"";
            ");

            migrationBuilder.DropTable(
                name: "ProjectDesigns");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectDesigns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    DesignJson = table.Column<string>(type: "jsonb", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectDesigns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectDesigns_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectDesigns_ProjectId",
                table: "ProjectDesigns",
                column: "ProjectId",
                unique: true);

            migrationBuilder.Sql(@"
                INSERT INTO ""ProjectDesigns"" (""ProjectId"", ""DesignJson"", ""UpdatedAt"")
                SELECT p.""Id"", p.""DesignJson"", p.""UpdatedAt""
                FROM ""Projects"" p;
            ");

            migrationBuilder.DropColumn(
                name: "DesignJson",
                table: "Projects");
        }
    }
}
